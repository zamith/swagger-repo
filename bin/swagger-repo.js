#!/usr/bin/env node
'use strict';

var fs = require('fs');

var _ = require('lodash');
var program = require('commander');
var api = require('../');

program.command('validate')
  .description('Validates a Swagger spec')
  .action(function (options) {
  });

program.command('bundle')
  .description('Bundles a multi-file Swagger spec')
  .option('-o, --outfile <filename>', 'The output file')
  .option('-y, --yaml', 'Output YAML(Default is JSON)')
  .action(function(options) {
    var swagger = api.bundle();
    var str = api.stringify(swagger, options);

    if (options.outfile) {
      fs.writeFileSync(options.outfile, str);
      console.log('Created "%s" swagger file.', options.outfile);
    }
    else {
      // Write the bundled spec to stdout
      console.log(str);
    }
  });

program.command('validate')
  .description('Validate Swagger file')
  .action(function(filename, options) {
    var swagger = api.bundle();
    api.validate(swagger, function (error, result) {
      var isErrors = !_.isEmpty(validation.errors);
      var isWarnings = !_.isEmpty(validation.warnings);

      if (!isErrors && !isWarnings)
        return;

      if (isErrors) {
        console.error('Validation errors:\n' +
            JSON.stringify(validation.errors, null, 2));
      }

      if (isWarnings) {
        console.error('Validation warnings:\n' +
            JSON.stringify(validation.warnings, null, 2));
      }

      process.exitCode = 255;
    });
  });

program.command('serve')
  .description('Serves a Swagger and some tools via the built-in HTTP server')
  .option('-p, --port <port>', 'The server port number')
  .action(function(filename, options) {
    api.serve(function (cb) {
      cb(null, api.bundle());
    });
  });

program
  .version(require('../package').version)
  .parse(process.argv);

// Show help if no options were given
if (program.rawArgs.length < 3) {
  program.help();
}
