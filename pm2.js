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
    setTimeout(() => {
        console.log(`Run "pm2 list" to see started processes.`)
        process.exit(0)
    }, 3000)
    return
})

function startRPC(port) {
    const processName = 'rcp_' + port
    pm2.start({
        script: 'server.js',
        name: processName,
        args: String(port)
    }, function (err, apps) {
        if (err) {
            console.error(err)
            pm2.restart(processName, (err, proc) => {
                pm2.disconnect()
            })
            return
        } else {
            console.log(`Started RPC server at port ${port}`)
        }
    })
}