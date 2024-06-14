const pm2 = require('pm2');
const count = parseInt(process.argv[2]);

if (isNaN(count) || count <= 0) {
    console.error('Invalid count value. Please provide a positive integer.');
    process.exit(1);
}

const config = require('./dist/src/config.js');
const startingPort = config.port ?? 8080;
console.log(`count: ${count}, starting port: ${startingPort}`);

pm2.connect(function (err) {
    if (err) {
        console.error('Failed to connect to PM2:', err);
        process.exit(2);
    }

    let processesStarted = 0;
    let processesFailed = 0;

    for (let i = 0; i < count; i++) {
        startRPC(startingPort + i, onProcessComplete);
    }

    function onProcessComplete(err) {
        if (err) {
            processesFailed++;
        } else {
            processesStarted++;
        }
        if (processesStarted + processesFailed === count) {
            setTimeout(() => {
                console.log(`Run "pm2 list" to see started processes.`);
                pm2.disconnect(() => {
                    process.exit(processesFailed > 0 ? 1 : 0);
                });
            }, 3000);
        }
    }
});

function startRPC(port, callback, retries = 3) {
    const processName = 'rpc_' + port;
    pm2.start(
        {
            script: 'dist/src/server.js',
            name: processName,
            args: String(port),
        },
        function (err, apps) {
            if (err) {
                console.error(`Failed to start RPC server at port ${port}:`, err);
                if (retries > 0) {
                    console.log(`Retrying... attempts left: ${retries}`);
                    pm2.restart(processName, (restartErr, proc) => {
                        if (restartErr) {
                            console.error(`Failed to restart RPC server at port ${port}:`, restartErr);
                            return callback(restartErr);
                        }
                        console.log(`Restarted RPC server at port ${port}`);
                        return callback(null);
                    });
                } else {
                    return callback(err);
                }
            } else {
                console.log(`Started RPC server at port ${port}`);
                callback(null);
            }
        }
    );
}

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.info('SIGINT signal received.');
    pm2.disconnect(() => {
        console.log('PM2 disconnected.');
        process.exit(0);
    });
});
