#!/usr/bin/env node
'use strict';

const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;
const yargsCjsEntry = path.join(__dirname, '..', 'node_modules', 'yargs', 'index.cjs');

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'yargs/yargs') {
    return originalLoad(yargsCjsEntry, parent, isMain);
  }

  return originalLoad(request, parent, isMain);
};

require(path.join(__dirname, '..', 'node_modules', 'c8', 'bin', 'c8.js'));
