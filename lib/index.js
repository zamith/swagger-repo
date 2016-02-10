'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var _ = require('lodash');
var YAML = require('js-yaml');
var glob = require('glob');
var sway = require('sway');

var express = require('express');
var cors = require('cors');
var statics = require('serve-static');

var baseDir = 'spec/';
var mainFile = baseDir + 'swagger.yaml';
var pathsDir = baseDir + 'paths/';
var definitionsDir = baseDir + 'definitions/';

exports.serve = function (swaggerGenerator) {
  var app = express();
  app.use(cors());

  console.log(require.resolve('swagger-ui'));
  // Route to Swagger UI
  app.use('/swagger-ui/', statics(require.resolve('swagger-ui') + '/../'));

  // Handle `file` parameter
  app.param('file', function (req, res, next, file) {
      req.file = file;
      next();
  });

  app.use('/spec.json', function (req, res, next) {
    swaggerGenerator(function (errors, swagger) {
      res.setHeader("Content-Type", "application/json");
      res.end(exports.stringify(swagger, {json: true}));
      next();
    });
  });

  app.use('/spec.yaml', function (req, res, next) {
    swaggerGenerator(function (errors, swagger) {
      res.setHeader("Content-Type", "application/yaml");
      res.end(exports.stringify(swagger, {yaml: true}));
      next();
    });
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

exports.bundle = function (cb) {
  var swagger = readYaml(mainFile);

  if (swagger.paths)
    throw Error('All paths should be defined inside ' + pathsDir);

  swagger.paths = _.mapKeys(globObject(pathsDir),function(value, key) {
    return '/' + key.replace(/\./g,'/');
  });

  if (swagger.definitions)
    throw Error('All definitions should be defined inside ' + definitionsDir);

  swagger.definitions = globObject(definitionsDir);
  return swagger;
}

exports.stringify = function (swagger, options) {
  if (options.yaml)
    return YAML.safeDump(swagger);

  return JSON.stringify(swagger, null, 2) + '\n';
};

function globObject(dir) {
  var files = glob.sync(dir + '*.yaml');
  var object = {};
  _.each(files, function (file) {
    object[path.parse(file).name] = readYaml(file);
  });
  return object;
}

function readYaml(file) {
  return YAML.safeLoad(fs.readFileSync(file, 'utf-8'), {json: true});
}
