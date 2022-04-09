const pm2 = require('pm2')
const count = parseInt(process.argv[2])

console.log("Count", count)

pm2.connect(function (err) {
    if (err) {
        console.error(err)
        process.exit(2)
    }

    for (let i = 0; i < count; i++) {
        startRPC(8080 + i)
    }
    return
})

function startRPC(port) {
    pm2.start({
        script: 'server.js',
        name: 'rcp_' + port,
        args: String(port)
    }, function (err, apps) {
        if (err) {
            console.error(err)
            pm2.restart('rpc', (err, proc) => {
                pm2.disconnect()
            })
            return
        } else {
            console.log(`Started RPC server at port ${port}`)
        }
    })


    // pm2.list((err, list) => {
    //     console.log(err, list)
    //     execa.command(`pm2 list`, { cwd: networkDir, env, stdio: [0, 1, 2] })
    // })

}