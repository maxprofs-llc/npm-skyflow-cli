const {execSync, spawnSync, spawn} = require('child_process'),
    shx = require('shelljs');

class Shell {

    constructor() {
        this.result = "";
        this.arrayResult = [];
        this.error = false;
        this.status = null;
    }

    /**
     * Run command synchronously without verbose
     * @param {string} command
     * @param {array} options
     * @returns {Shell}
     */
    run(command, options) {

        this.error = false;

        let spawn = spawnSync(command + '', options);

        this.status = spawn.status;

        if(spawn.status === null || spawn.status !== 0){
            this.error = spawn.error;
            return this;
        }

        this.result = spawn.stdout.toString().trim();
        this.arrayResult = this.result.split("\n");

        if (this.arrayResult[0] === '') {
            this.arrayResult = [];
        }

        return this;
    }

    exec(command) {
        execSync(command, {stdio: [process.stdin, process.stdout, process.stderr]});
    }

    runAsync(command, options) {
        let cmd = spawn(command + '', options);
        cmd.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        cmd.stderr.on('data', (data) => {
            Output.writeln(data);
            // console.log(`stdout: ${data}`);
        });

    }

    hasError() {
        return this.error !== false;
    }

    getError() {
        return this.error;
    }

    getResult() {
        return this.result;
    }

    getStatus() {
        return this.status;
    }

    getArrayResult() {
        return this.arrayResult;
    }

    // More details on the following methods, see https://www.npmjs.com/package/shelljs

    chmod(){
        shx.chmod(...arguments)
    }

    cd(){
        shx.cd(...arguments)
    }

    cp(){
        shx.cp(...arguments)
    }

    pushd(){
        shx.pushd(...arguments)
    }

    popd(){
        shx.popd(...arguments)
    }

    dirs(){
        shx.dirs(...arguments)
    }

    echo(){
        shx.echo(...arguments)
    }

    /*exec(){
        shx.exec(...arguments)
    }*/

    find(){
        shx.find(...arguments)
    }

    grep(){
        shx.grep(...arguments)
    }

    head(){
        shx.head(...arguments)
    }

    ln(){
        shx.ln(...arguments)
    }

    mkdir(){
        shx.mkdir(...arguments)
    }

    mv(){
        shx.mv(...arguments)
    }

    pwd(){
        shx.pwd(...arguments)
    }

    rm(){
        shx.rm(...arguments)
    }

    sed(){
        shx.sed(...arguments)
    }

    set(){
        shx.set(...arguments)
    }

    sort(){
        shx.sort(...arguments)
    }

    tail(){
        shx.tail(...arguments)
    }

    tempdir(){
        shx.tempdir(...arguments)
    }

    test(){
        shx.test(...arguments)
    }

    touch(){
        shx.touch(...arguments)
    }

    uniq(){
        shx.uniq(...arguments)
    }

    which(){
        shx.which(...arguments)
    }

    exit(){
        shx.exit(...arguments)
    }

    error(){
        shx.error(...arguments)
    }

    popd(){
        shx.popd(...arguments)
    }

    popd(){
        shx.popd(...arguments)
    }

    popd(){
        shx.popd(...arguments)
    }

    popd(){
        shx.popd(...arguments)
    }

    popd(){
        shx.popd(...arguments)
    }
    popd(){
        shx.popd(...arguments)
    }
}

module.exports = new Shell();