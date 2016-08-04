'use strict';

var fs = require('fs');
var Path = require('path');

var _ = require('lodash');
var YAML = require('js-yaml');
var glob = require('glob').sync;
var sway = require('sway');
var mkdirp = require('mkdirp').sync;

var jpath = require('jsonpath');
var jsonpointer = require('json-pointer');

var express = require('express');
var cors = require('cors');
var statics = require('serve-static');
var bodyParser = require('body-parser');

var baseDir = 'spec/';
var mainFile = baseDir + 'swagger.yaml';
var pathsDir = baseDir + 'paths/';
var definitionsDir = baseDir + 'definitions/';
var codeSamplesDir = baseDir + 'code_samples/';

var anyYaml = '**/*.yaml';

exports.serve = function (swaggerGenerator) {
  var app = express();
  app.use(cors());

  console.log(require.resolve('swagger-ui'));
  // Route to Swagger UI
  app.use('/swagger-ui/', statics(Path.dirname(require.resolve('swagger-ui/dist/index.html'))));
  app.use('/swagger-editor/config/defaults.json', statics(require.resolve('./editor_config.json')));
  app.use('/swagger-editor/', statics(Path.dirname(require.resolve('swagger-editor/index.html'))));

  // Handle `file` parameter
  app.param('file', function (req, res, next, file) {
      req.file = file;
      next();
  });

  app.use('/swagger.json', function (req, res, next) {
    swaggerGenerator(function (errors, swagger) {
      res.setHeader("Content-Type", "application/json");
      res.end(exports.stringify(swagger, {json: true}));
      next();
    });
  });

  app.use('/swagger.yaml', function (req, res, next) {
    swaggerGenerator(function (errors, swagger) {
      res.setHeader("Content-Type", "application/yaml");
      res.end(exports.stringify(swagger, {yaml: true}));
      next();
    });
  });

  app.use(bodyParser.text({ type: 'application/yaml'}));
  app.use('/swagger-editor-backend/swagger.yaml', function (req, res, next) {
    if (req.method === 'PUT') {
      exports.syncWithSwagger(req.body);
      res.end('ok');
      //TODO: error handling
      next();
    }
    else {
      return swaggerGenerator(function (errors, swagger) {
        res.setHeader("Content-Type", "application/yaml");
        res.end(exports.stringify(swagger, {yaml: true}));
        next();
      });
    }
  });

  // Error handler
  app.use(function(err, req, res, next) {
      console.error(err.stack);
      res.status(500).json({'error' : err.message});
      next(err);
  });

  // Run server
  app.listen(3000);
}

exports.syncWithSwagger = function (swagger) {
  if (_.isString(swagger))
    swagger = exports.parse(swagger);
  // FIXME: support x-code-samples
  // FIXME: support for headers
  var paths = _.mapKeys(swagger.paths,function(value, key) {
    return key.substring(1).replace(/\//g,'@');
  });

  updateGlobObject(pathsDir, paths);
  updateGlobObject(definitionsDir, swagger.definitions);
  saveYaml(mainFile, _.omit(swagger, ['paths', 'definitions']));
}

exports.bundle = function () {
  var swagger = readYaml(mainFile);

  console.log('Adding paths to spec');
  var pathsObj = globObject(pathsDir, anyYaml, _.flow([baseName, filenameToPath]));
  if (swagger.paths && !_.isEmpty(pathsObj))
    throw Error('All paths should be defined inside ' + pathsDir);
  swagger.paths = _.mapValues(pathsObj, readYaml);

  console.log('Adding definitions to spec');
  var definitionsObj = globObject(definitionsDir, anyYaml, baseName);
  if (swagger.definitions && !_.isEmpty(definitionsObj))
    throw Error('All definitions should be defined inside ' + definitionsDir);
  swagger.definitions = _.mapValues(definitionsObj, readYaml);

  if (swagger.headers) {
    console.log('Inlining headers referencess');
    inlineHeaders(swagger);
  }

  var codeSamples = globObject(codeSamplesDir, '*/*/*', function (path) {
    // path === '<language>/<path>/<verb>'
    var dirs = Path.dirname(path).split(Path.sep);
    // [<path>, <verb>, <language>]
    return [filenameToPath(dirs[1]), baseName(path), dirs[0]];
  });

  _.each(codeSamples, function (pathSamples, path) {
    _.each(pathSamples, function (opSamples, verb) {
      var swaggerOperation = _.get(swagger.paths, [path, verb]);
      if (_.isUndefined(swaggerOperation))
        throw Error('Code sample for non-existing operation: "' + path + '",' + verb);

      swaggerOperation['x-code-samples'] = _.map(opSamples, function (path, lang) {
        return {lang: lang, source: fs.readFileSync(path, 'utf-8')};
      });
    });
  });

  return swagger;
}

exports.stringify = function (swagger, options) {
  if (options.yaml)
    return YAML.safeDump(swagger, {indent: 2, lineWidth: -1});

  return JSON.stringify(swagger, null, 2) + '\n';
};

exports.parse = function (string) {
  try {
    return JSON.parse(string)
  }
  catch(jsonError) {
    try {
      return YAML.safeLoad(string, {json: true});
    }
    catch(yamlError) {
      //TODO: better error message
      throw new Error('Can not parse Swagger both in YAML and JSON');
    }
  }
};

exports.validate = function (swagger, cb) {
  sway.create({definition: swagger})
  .then(function (swaggerObj) {
    return cb(null, swaggerObj.validate());
  }, function (error) {
    cb(error);
  });
}

function inlineHeaders(swagger) {
  jpath.apply(swagger, '$..[?(@.$ref)]', function(value) {
    if (!value.$ref.startsWith('#/headers'))
      return value;

    //TODO: throw if (!_.omit(value, '$ref').isEmpty())
    return jsonpointer.get(swagger, value.$ref.substring(1));
  });
  delete swagger.headers;
}

function baseName(path) {
  return Path.parse(path).name;
}

function filenameToPath(filename) {
  return '/' + filename.replace(/@/g,'/');
}

function globObject(dir, pattern, objectPathCb) {
  return _.reduce(glob(dir + pattern), function (result, path) {
    var objPath = objectPathCb(path.substring(dir.length));
    if (_.has(result, objPath))
      throw new Error(objPath + " definition already exists");
    _.set(result, objPath, path);

    return result;
  }, {});
}

function updateGlobObject(dir, object) {
  var knownKeys = globObject(dir, anyYaml, baseName);

  if (!_.isEmpty(object))
    mkdirp(dir);

  _.each(object, function (value, key) {
    var filename = Path.join(dir, key + '.yaml');
    if (key in knownKeys) {
      filename = knownKeys[key];
      delete knownKeys[key];
    }
    saveYaml(filename, value);
  });

  _(knownKeys).values().each(fs.unlinkSync);
}

function readYaml(file) {
  return YAML.safeLoad(fs.readFileSync(file, 'utf-8'), {json: true});
}

function saveYaml(file, object) {
  return fs.writeFileSync(file, YAML.safeDump(object, {noRefs: true}));
}
