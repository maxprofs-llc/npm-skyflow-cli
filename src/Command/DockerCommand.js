'use strict';

const resolve = require('path').resolve,
    fs = require('fs'),
    os = require('os');

const Helper = Skyflow.Helper,
    Shell = Skyflow.Shell,
    File = Skyflow.File,
    Directory = Skyflow.Directory,
    Input = Skyflow.Input,
    Request = Skyflow.Request,
    Output = Skyflow.Output;

const download = require('image-downloader');

const help = require(resolve(__dirname, '..', '..', 'resources', 'docker', 'cli-commands.js'));


function getDockerDirFromConfig() {

    Skyflow.currentConfMiddleware();
    let currentDockerDir = Skyflow.getConfig('modules.docker.directory');
    if (!currentDockerDir) {
        Output.error("Docker directory not found in modules array.", false);
        return false
    }
    return currentDockerDir;
}

function runDockerComposeCommand(command, options = []) {

    let currentDockerDir = getDockerDirFromConfig();
    if (!currentDockerDir) {
        return 1
    }

    Directory.create(currentDockerDir);

    let cwd = process.cwd();
    process.chdir(currentDockerDir);
    Shell.exec('docker-compose ' + command + ' ' + options.join(' '));
    process.chdir(cwd)

}

function updateCompose(composes = []) {

    Skyflow.currentConfMiddleware();

    let dockerDir = Skyflow.getConfig('modules.docker.directory');
    if (!dockerDir) {
        Output.error("Docker directory not found in modules array.", false);
        return 1
    }
    dockerDir = resolve(process.cwd(), dockerDir);

    if (!composes[0]) {

        composes = Directory.read(dockerDir, {directory: true, file: false});

    }

    let allQuestions = [];

    composes.forEach((compose) => {

        if (!Directory.exists(resolve(dockerDir, compose))) {
            Output.error("Compose " + compose + " not found.", false);
            return 1
        }

        if (File.exists(resolve(dockerDir, compose, 'prompt.js'))) {
            let questions = require(resolve(dockerDir, compose, 'prompt.js')).questions;
            questions.forEach((question) => {
                question.message = "[" + compose + "] " + question.message;
                question.name = "__" + compose + "__" + question.name;
                allQuestions.push(question);
            })
        }

    });

    if (allQuestions.length === 0) {
        return 1
    }

    function questionsCallback(responses) {

        let dest = resolve(dockerDir, 'docker-compose.yml');
        if (!File.exists(dest)) {
            let content = "version: \"2\"" + os.EOL + os.EOL +
                "services:";
            File.create(dest, content);
            if (Skyflow.isInux()) {
                fs.chmodSync(dest, '777')
            }
        }

        let storage = {
            composes: {},
            dockerfiles: {}
        };

        for (let response in responses) {

            if (!responses.hasOwnProperty(response)) {
                continue
            }

            let compose = null;

            response = response.replace(/^__([a-z0-9_\-]+)__/i, (m, c) => {
                compose = c;
                return '';
            });

            let composeDir = resolve(dockerDir, compose),
                dockerfile = "",
                dockerCompose = "";

            if (File.exists(resolve(composeDir, 'Dockerfile.dist')) && !storage.dockerfiles[compose]) {
                storage.dockerfiles[compose] = File.read(resolve(composeDir, 'Dockerfile.dist'))
            }
            if (File.exists(resolve(composeDir, 'docker-compose.dist')) && !storage.composes[compose]) {
                storage.composes[compose] = File.read(resolve(composeDir, 'docker-compose.dist'))
            }

            let regex = new RegExp("\{\{ ?" + response + " ?\}\}", "g");

            // Update Dockerfile
            dockerfile = storage.dockerfiles[compose];

            if (dockerfile) {
                dockerfile = dockerfile.replace(regex, responses["__" + compose + "__" + response]);
                storage.dockerfiles[compose] = dockerfile;
                let dest = resolve(composeDir, 'Dockerfile');
                File.create(dest, dockerfile);
                if (Skyflow.isInux()) {
                    fs.chmodSync(dest, '777')
                }
            }

            // Update docker-compose.yml
            dockerCompose = storage.composes[compose];

            if (dockerCompose) {

                dockerCompose = dockerCompose.replace(regex, responses["__" + compose + "__" + response]);
                storage.composes[compose] = dockerCompose;

                dockerCompose = os.EOL + os.EOL + "# ------> " + compose + " ------>" + os.EOL +
                    dockerCompose + os.EOL +
                    "# <------ " + compose + " <------";

                dest = resolve(dockerDir, 'docker-compose.yml');

                // Remove previous compose from docker-compose.yml
                let content = File.read(dest);
                content = content.replace(new RegExp(
                    os.EOL + os.EOL + "# ------> " + compose + " ------>[\\s\\S]+" +
                    "# <------ " + compose + " <------"
                    , "m"), "");

                content += dockerCompose;

                File.create(dest, content);
                if (Skyflow.isInux()) {
                    fs.chmodSync(dest, '777')
                }

            }


        }

        for (let compose in storage.composes) {
            Output.success(compose + " added into docker-compose.yml.");
        }
    }

    if (Request.hasOption('file')) {
        let responses = require(Request.getOption('file'));
        questionsCallback(responses);
        return 0
    }

    Input.input(allQuestions, questionsCallback);

    return 0
}

function getCompose(compose, version = null, update = true) {

    Skyflow.currentConfMiddleware();

    let composeDir = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'compose', compose);

    if (!Directory.exists(composeDir)) {
        return 1
    }

    let prompt = null;

    if (File.exists(resolve(composeDir, 'prompt.js'))) {
        prompt = resolve(composeDir, 'prompt.js')
    }

    if (version && Directory.exists(resolve(composeDir, version))) {

        composeDir = resolve(composeDir, version);

        if (File.exists(resolve(composeDir, 'prompt.js'))) {
            prompt = resolve(composeDir, 'prompt.js')
        }
    }

    let currentDockerDir = Skyflow.getConfig('modules.docker.directory');
    if (!currentDockerDir) {
        Output.error("Docker directory not found in modules array.", false);
        return 1
    }

    Directory.create(resolve(currentDockerDir, compose));

    // Copy conf dir
    if (Directory.exists(resolve(composeDir, 'conf'))) {
        Directory.copy(resolve(composeDir, 'conf'), resolve(currentDockerDir, compose, 'conf'))
    }

    // Copy Dockerfile
    if (File.exists(resolve(composeDir, 'Dockerfile'))) {
        let dest = resolve(currentDockerDir, compose, 'Dockerfile.dist');
        File.copy(resolve(composeDir, 'Dockerfile'), dest);
        if (Skyflow.isInux()) {
            fs.chmodSync(dest, '777')
        }
    }

    // Copy docker-compose.yml
    if (File.exists(resolve(composeDir, compose + '.yml'))) {
        let dest = resolve(currentDockerDir, compose, 'docker-compose.dist');
        File.copy(resolve(composeDir, compose + '.yml'), dest);
        if (Skyflow.isInux()) {
            fs.chmodSync(dest, '777')
        }
    }

    // Copy prompt file
    if (prompt) {
        let dest = resolve(currentDockerDir, compose, 'prompt.js');
        File.copy(resolve(composeDir, 'prompt.js'), dest);
        if (Skyflow.isInux()) {
            fs.chmodSync(dest, '777')
        }
    }

    if (Request.hasOption('y')) {
        Output.success(compose + " added.");
    }

    return update ? updateCompose([compose]) : 0;
}

function getPackage(pkg, version = null) {

    let pkgDir = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'package', pkg);

    if (version && Directory.exists(resolve(pkgDir, version))) {

        pkgDir = resolve(pkgDir, version);

    }

    if (File.exists(resolve(pkgDir, pkg + '.yml'))) {
        let pkgContent = File.read(resolve(pkgDir, pkg + '.yml'));

        pkgContent.replace(/{% ?([a-z0-9_\-]+(:?\:[a-z0-9\.\-]+)?) ?%}/g, (m, compose) => {

            compose = compose.split(':');
            let v = null;
            if (compose[1]) {
                v = 'v' + compose[1]
            }

            getCompose(compose[0], compose[1] ? ('v' + compose[1]) : null, false)

        });

    }

    return updateCompose()
}


function composeList() {

    let list = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'compose', 'list.js'),
        listAll = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'compose', 'list_all.js');

    async function pullAssets() {

        let assetsPath = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'assets', 'compose');
        Directory.create(assetsPath);

        let lists = require(listAll);

        for (let l in lists) {

            if (!lists.hasOwnProperty(l)) {
                continue
            }

            try {
                const {filename} = await download.image({
                    url: lists[l]['img'],
                    dest: resolve(assetsPath, lists[l]['name'] + '.png')
                });
                Output.success(lists[l]['name']);
            } catch (e) {
                Output.error(lists[l]['img'] + ' not found.');
            }

        }

        displayComposeList()

    }

    function displayComposeList() {

        list = require(list);

        Output.newLine();
        Output.writeln('Available compose:', 'blue', null, 'bold');
        Output.writeln('-'.repeat(50), 'blue', null, 'bold');

        for (let name in list) {
            if (!list.hasOwnProperty(name)) {
                continue;
            }
            Output.write(name, null, null, 'bold');
            Output.writeln(' -> compose:add ' + name.toLowerCase());
            Output.writeln(list[name], 'gray')

        }

    }

    if (!File.exists(list) || !File.exists(listAll)) {

        Output.writeln("Pulling compose list from " + Skyflow.Api.protocol + '://' + Skyflow.Api.host + " ...", false);

        Skyflow.Api.get('list/docker/compose', (response) => {

            if (response.statusCode !== 200) {
                Output.error("Can not pull compose list.", false);
                return 1
            }

            let dest = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'compose');
            Directory.create(dest);

            File.create(resolve(dest, 'list.js'), response.body.list);
            delete response.body.list;
            File.create(resolve(dest, 'list_all.js'), "module.exports = " + JSON.stringify(response.body));

            if (Skyflow.isInux()) {
                fs.chmodSync(resolve(dest, 'list.js'), '777')
            }
            if (Skyflow.isInux()) {
                fs.chmodSync(resolve(dest, 'list_all.js'), '777')
            }

            pullAssets()

        });

        return 1
    } else {
        displayComposeList()
    }

    return 0
}

function packageList() {

    let list = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'package', 'list.js'),
        listAll = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'package', 'list_all.js');

    async function pullAssets() {

        let assetsPath = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'assets', 'compose');
        Directory.create(assetsPath);

        let lists = require(listAll);

        for (let l in lists) {

            if (!lists.hasOwnProperty(l)) {
                continue
            }

            try {
                const {filename} = await download.image({
                    url: lists[l]['img'],
                    dest: resolve(assetsPath, lists[l]['name'] + '.png')
                });
                Output.success(lists[l]['name']);
            } catch (e) {
                Output.error(lists[l]['img'] + ' not found.');
            }

        }

        displayPackageList()

    }

    function displayPackageList() {

        list = require(list);

        Output.newLine();
        Output.writeln('Available package:', 'blue', null, 'bold');
        Output.writeln('-'.repeat(50), 'blue', null, 'bold');

        for (let name in list) {
            if (!list.hasOwnProperty(name)) {
                continue;
            }
            Output.write(name, null, null, 'bold');
            Output.writeln(' -> package:add ' + name.toLowerCase());
            Output.writeln(list[name], 'gray')

        }

    }

    if (!File.exists(list) || !File.exists(listAll)) {

        Output.writeln("Pulling package list from " + Skyflow.Api.protocol + '://' + Skyflow.Api.host + " ...", false);

        Skyflow.Api.get('list/docker/package', (response) => {

            if (response.statusCode !== 200) {
                Output.error("Can not pull package list.", false);
                return 1
            }

            let dest = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'package');
            Directory.create(dest);

            File.create(resolve(dest, 'list.js'), response.body.list);
            delete response.body.list;
            File.create(resolve(dest, 'list_all.js'), "module.exports = " + JSON.stringify(response.body));

            if (Skyflow.isInux()) {
                fs.chmodSync(resolve(dest, 'list.js'), '777')
            }
            if (Skyflow.isInux()) {
                fs.chmodSync(resolve(dest, 'list_all.js'), '777')
            }

            pullAssets();

        });

        return 1
    } else {
        displayPackageList()
    }

    return 0;
}

class DockerCommand {

    help() {
        Output.newLine();

        Output.writeln('For more details see:');
        Output.writeln('https://docs.docker.com/compose/reference', 'blue');
        Output.writeln('https://docs.docker.com/engine/reference/commandline/cli', 'blue');

        Output.newLine();

        let keys = Object.keys(help);

        keys = keys.sort();

        keys.forEach((k) => {

            Output.writeln(k, 'green', null, 'bold');

            // Description
            if (help[k]['description']) {
                Output.writeln(help[k]['description'])
            }

            // Options
            const options = help[k]['options'];
            if (Helper.isObject(options) && !Helper.isEmpty(options)) {
                Output.writeln('Options:', 'cyan', null, 'underline');
                for (let o in options) {
                    Output.write(o, 'magenta').space(2).writeln(options[o]);
                }
            }

            Output.newLine()

        });
    }

    ls(options) {

        let what = 'container';

        let index = options.indexOf('image');
        if (index > -1) {
            what = 'image';
            options[index] = null
        }

        index = options.indexOf('images');
        if (index > -1) {
            what = 'image';
            options[index] = null
        }

        index = options.indexOf('container');
        if (index > -1) {
            what = 'container';
            options[index] = null
        }

        index = options.indexOf('containers');
        if (index > -1) {
            what = 'container';
            options[index] = null
        }

        Shell.exec('docker ' + what + ' ls ' + options.join(' '));

    }

    rmc(options) {

        let force = false;
        if (options.indexOf('-f') > -1 || options.indexOf('--force') > -1) {
            force = true;
        }

        if (options.indexOf('-a') > -1 || options.indexOf('--all') > -1) {
            Shell.run('docker', ['container', 'ls', '-a', '-q']);
            options = Shell.getArrayResult();
            if (options.length === 0) {
                Output.info('No containers found!', false);
                return 0;
            }
        }

        if (force) {
            options.unshift('-f')
        }

        options.unshift('container', 'rm');

        Shell.run('docker', options);
        Output.writeln(Shell.getResult());
        Output.success('Success!', false);
        Output.newLine();

    }

    rmi(options) {
        let force = false;
        if (options.indexOf('-f') > -1 || options.indexOf('--force') > -1) {
            force = true;
        }

        if (options.indexOf('-a') > -1 || options.indexOf('--all') > -1) {
            Shell.run('docker', ['image', 'ls', '-a', '-q']);
            options = Shell.getArrayResult();
            if (options.length === 0) {
                Output.info('No images found!', false);
                return 0;
            }
        }

        if (force) {
            options.unshift('-f')
        }

        options.unshift('image', 'rm');

        Shell.run('docker', options);
        Output.writeln(Shell.getResult());
        Output.success('Success!', false);
        Output.newLine();

    }

    ps(options) {
        Shell.exec('docker ps ' + options.join(' '));
    }

    // Alias
    up(options) {
        this.__compose__up(options)
    }

    /*------------ Run by container ----------*/

    __exec(container, options) {
        runDockerComposeCommand('exec ' + container, options);
    }

    __sh(container) {
        runDockerComposeCommand('exec ' + container, ['sh']);
    }

    __bash(container) {
        runDockerComposeCommand('exec ' + container, ['bash']);
    }

    __up(container, options) {
        let currentDockerDir = getDockerDirFromConfig();
        if (!currentDockerDir) {
            return 1
        }

        let cwd = process.cwd();
        process.chdir(currentDockerDir);
        Shell.exec('docker-compose up ' + options.join(' ') + ' ' + container);
        process.chdir(cwd);

    }

    __pull(container, options) {
        runDockerComposeCommand('pull ' + container, options);
    }

    __stop(container, options) {
        runDockerComposeCommand('stop ' + container, options);
    }

    __start(container, options) {
        runDockerComposeCommand('start ' + container, options);
    }

    __rm(container, options) {
        runDockerComposeCommand('stop ' + container, options);
        runDockerComposeCommand('rm', options);
    }

    __kill(container, options) {
        runDockerComposeCommand('kill ' + container, options);
    }

    __logs(container, options) {
        runDockerComposeCommand('logs ' + container, options);
    }

    __restart(container, options) {
        runDockerComposeCommand('restart ' + container, options);
    }

    __run(container, options) {
        runDockerComposeCommand('run --rm --name ' + container + ' ' + container, options);
    }


    /*------------ Run for compose ----------*/

    compose() {

        if (Request.hasOption('list')) {
            return composeList();
        }

        return 1
    }

    __compose__add(composes) {

        if (composes.length === 0) {
            Request.setOption('list');
            return this.compose()
        }

        let compose = composes[0],
            composeDir = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'compose', compose);

        let version = Request.getOption('version') || Request.getOption('v');

        function runAfterPull() {
            let versions = Directory.read(composeDir, {directory: true, file: false, filter: /^(v-?|version-)/});

            if (versions.length === 0) {
                return getCompose(compose, null, !Request.hasOption('y'))
            }

            // let version = Request.getOption('version') || Request.getOption('v');

            if (version) {
                return getCompose(compose, 'v' + version, !Request.hasOption('y'))
            }

            // Choices
            Input.choices(
                {
                    message: 'Choose ' + compose + ' version',
                },
                versions,
                answer => {
                    getCompose(compose, answer.response, !Request.hasOption('y'))
                }
            );
        }

        if ((version && !Directory.exists(resolve(composeDir, 'v' + version))) || !Directory.exists(composeDir)) {

            Output.writeln("Pulling " + compose + " compose from " + Skyflow.Api.protocol + '://' + Skyflow.Api.host + " ...", false);

            Skyflow.Api.get('docker/compose/' + compose, (response) => {

                if (response.statusCode !== 200) {
                    Output.error(compose + " compose not found.", false);
                    return 1
                }

                response.body.compose.forEach((c) => {

                    let dest = resolve(Skyflow.getUserHome(), '.skyflow', ...c.directory);

                    Directory.create(dest);

                    File.create(resolve(dest, c.file), c.content);
                    if (Skyflow.isInux()) {
                        fs.chmodSync(resolve(dest, c.file), '777')
                    }

                });

                runAfterPull();

            });

            return 1
        } else {

            runAfterPull();
        }

        return 0
    }

    __compose__remove(composes) {

        Skyflow.currentConfMiddleware();

        let compose = composes[0];

        if (!compose) {
            Output.error("Missing argument.", false);
            return 1
        }

        let dockerDir = Skyflow.getConfig('modules.docker.directory');
        if (!dockerDir) {
            Output.error("Docker directory not found in modules array.", false);
            return 1
        }
        dockerDir = resolve(process.cwd(), dockerDir);

        let dest = resolve(dockerDir, 'docker-compose.yml');
        if (!File.exists(dest)) {
            Output.error("docker-compose.yml not found.", false);
            return 1
        }
        if (!Directory.exists(resolve(dockerDir, compose))) {
            Output.error("Compose " + compose + " not found.", false);
            return 1;
        }

        // Remove compose from docker-compose.yml
        let content = File.read(dest);
        content = content.replace(new RegExp(
            os.EOL + os.EOL + "# ------> " + compose + " ------>[\\s\\S]+" +
            "# <------ " + compose + " <------"
            , "m"), "");

        File.create(dest, content);
        if (Skyflow.isInux()) {
            fs.chmodSync(dest, '777')
        }

        Output.success(compose + " removed from docker-compose.yml.");

        if (Request.hasOption('dir')) {
            Directory.remove(resolve(dockerDir, compose));
            Output.success(compose + " directory removed.");
        }

        return 0
    }

    __compose__update(composes) {

        return updateCompose(composes)
    }

    __compose__ps(options) {
        runDockerComposeCommand('ps', options);
    }

    __compose__build(options) {
        runDockerComposeCommand('build', options);
    }

    __compose__config(options) {
        runDockerComposeCommand('config', options);
    }

    __compose__services() {
        runDockerComposeCommand('config', ['--services']);
    }

    __compose__volumes() {
        runDockerComposeCommand('config', ['--volumes']);
    }

    __compose__down(options) {
        runDockerComposeCommand('down', options);
    }

    __compose__up(options) {
        runDockerComposeCommand('up', options);
    }

    __compose__kill(options) {
        runDockerComposeCommand('kill', options);
    }

    __compose__logs(options) {
        runDockerComposeCommand('logs', options);
    }

    __compose__restart(options) {
        runDockerComposeCommand('restart', options);
    }

    __compose__stop(options) {
        runDockerComposeCommand('stop', options);
    }

    __compose__start(options) {
        runDockerComposeCommand('start', options);
    }

    __compose__rm(options) {
        runDockerComposeCommand('stop', options);
        runDockerComposeCommand('rm', options);
    }

    __compose__pull(options) {
        runDockerComposeCommand('pull', options);
    }

    /*------------ Run for package ----------*/

    package() {

        if (Request.hasOption('list')) {
            return packageList();
        }

        return 1
    }

    __package__add(packages) {

        if (packages.length === 0) {
            Request.setOption('list');
            return this.package()
        }

        let pkg = packages[0],
            packageDir = resolve(Skyflow.getUserHome(), '.skyflow', 'docker', 'package', pkg);

        let version = Request.getOption('version') || Request.getOption('v');

        function runAfterPull() {
            let versions = Directory.read(packageDir, {directory: true, file: false, filter: /^(v-?|version-)/});

            if (versions.length === 0) {
                return getPackage(pkg, null, !Request.hasOption('y'))
            }

            if (version) {
                return getPackage(pkg, 'v' + version, !Request.hasOption('y'))
            }

            // Choices
            Input.choices({message: 'Choose ' + pkg + ' version'}, versions, answer => {
                    getPackage(pkg, answer.response, !Request.hasOption('y'))
                }
            );
        }

        if ((version && !Directory.exists(resolve(packageDir, 'v' + version))) || !Directory.exists(packageDir)) {

            Output.writeln("Pulling " + pkg + " package from " + Skyflow.Api.protocol + '://' + Skyflow.Api.host + " ...", false);

            Skyflow.Api.get('docker/package/' + pkg, (response) => {

                if (response.statusCode !== 200) {
                    Output.error(pkg + " package not found.", false);
                    return 1
                }

                response.body.package.forEach((pkg) => {

                    let dest = resolve(Skyflow.getUserHome(), '.skyflow', ...pkg.directory);

                    Directory.create(dest);

                    File.create(resolve(dest, pkg.file), pkg.content);
                    if (Skyflow.isInux()) {
                        fs.chmodSync(resolve(dest, pkg.file), '777')
                    }

                });

                if (!Request.hasOption('y')) {
                    runAfterPull()
                }

            });

            return 1
        } else {

            if (!Request.hasOption('y')) {
                runAfterPull()
            }

        }

        return 0
    }

}

module.exports = new DockerCommand();