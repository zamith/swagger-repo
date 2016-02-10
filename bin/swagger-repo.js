#!/usr/bin/env node
'use strict';

var fs = require('fs');

var program = require('commander');
var api = require('../');

program.command('validate')
  .description('Validates a Swagger spec')
  .action(function (options) {
  });

program.command('bundle')
  .description('Bundles a multi-file Swagger spec')
  .option('-o, --outfile <filename>', 'The output file')
  .option('-j, --json', 'Output JSON(default)')
  .option('-y, --yaml', 'Output YAML')
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
