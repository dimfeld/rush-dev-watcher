#!/usr/bin/env node
const rushLib = require('@microsoft/rush-lib');
const execa = require('execa');
const path = require('path');
const { default: Dag } = require('dag-map');
const { Transform } = require('stream');
const { EventEmitter } = require('events');
const chalk = require('chalk');
const yargs = require('yargs');

const args = yargs
  .scriptName('dev')
  .usage('$0 [--and-deps|--just-deps] PACKAGE [MOREPACKAGES...]')
  .boolean('and-deps')
  .boolean('just-deps')
  .help().argv;

const aliases = {
  dg: 'demandgeneration',
  demandgen: 'demandgeneration',
};

function transformer(prefix) {
  let emitter = new EventEmitter();
  let transform = new Transform({
    transform(chunk, enc, cb) {
      chunk = chunk.toString();
      if (
        // TSC watcher
        chunk.includes('Watching for file changes') ||
        // Webpack finished
        chunk.includes('Built at:') ||
        // API
        chunk.includes('[nodemon]')
      ) {
        emitter.emit('initial-build-done');
      }

      let lines = chunk
        .split('\n')
        .map((line) => `${chalk.blue(prefix)}: ${line}`)
        .join('\n');
      if (!lines.endsWith('\n')) {
        lines += '\n';
      }
      cb(null, lines);
    },
    flush(cb) {
      emitter.emit('initial-build-done');
      cb();
    },
  });

  return { emitter, transform };
}

async function startBuilding(project) {
  console.log(
    `${chalk.green('dev')}: Starting to build ${chalk.bold.blue(
      project.packageName
    )}`
  );

  let devCommand = require(path.join(project.projectFolder, 'package.json'))
    .scripts.dev;
  if (!devCommand) {
    console.error(
      `${chalk.yellow('Warning')}: ${project.packageName} has no dev command`
    );
    return Promise.resolve();
  }

  let args = ['dev'];
  if (devCommand.includes('tsc')) {
    args.push('--preserveWatchOutput');
  }

  let pr = execa('rushx', args, {
    cwd: project.projectFolder,
  });

  let { emitter, transform } = transformer(project.packageName);

  pr.stderr.pipe(transform);
  pr.stdout.pipe(transform);
  transform.pipe(process.stdout);

  return new Promise(async (resolve, reject) => {
    emitter.once('initial-build-done', resolve);
    await pr;
  });
}

function gatherProjects() {
  const rushConfig = rushLib.RushConfiguration.loadFromDefaultLocation({
    startingFolder: process.cwd(),
  });

  let projects = new Map();

  let recurseProjectDeps = (project) => {
    for (let dep of project.localDependencyProjects) {
      if (projects.has(dep.packageName)) {
        continue;
      }

      projects.set(dep.packageName, dep);
      recurseProjectDeps(dep);
    }
  };

  for (let arg of args._) {
    let actualArg = aliases[arg] || arg;
    let project = rushConfig.findProjectByShorthandName(actualArg);
    if (!project) {
      console.error(`Could not find project ${arg}`);
      process.exit(1);
    }

    if (!args['just-deps']) {
      projects.set(project.packageName, project);
    }

    if (args['and-deps'] || args['just-deps']) {
      recurseProjectDeps(project);
    }
  }

  return projects;
}

async function run() {
  let projects = gatherProjects();

  let dag = new Dag();
  for (let [name, project] of projects.entries()) {
    let deps = project.localDependencyProjects
      .map((p) => p.packageName)
      .filter((p) => projects.has(p));
    dag.add(name, project, [], deps);
  }

  let inOrder = [];
  dag.each((_name, project) => {
    inOrder.push(project);
  });

  for (let project of inOrder) {
    await startBuilding(project);
  }

  console.log(chalk.green('\n\nAll watchers started!'));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
