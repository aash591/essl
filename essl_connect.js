const ZKLib = require('zkteco-js');

const test = async () => {
    let zkInstance = new ZKLib('10.10.20.58', 4370, 10000, 4000);
    try {
        // Create socket to machine 
        await zkInstance.createSocket();


        // Get general info like logCapacity, user counts, logs count
        // It's really useful to check the status of the device 
        console.log(await zkInstance.getInfo());
    } catch (e) {
        console.log(e);
        if (e.code === 'EHOSTUNREACH') {
            console.log(zkInstance);
        }
    }

    // Get users in machine
    const users = await zkInstance.getUsers();
    console.log('Users:', users.data.slice(0, 20)); // Print first 5 users

    // Get all logs in the machine
    // Currently, there is no filter to take data, it just takes all !!
    const logs = await zkInstance.getAttendances();
    console.log('Logs:', logs.data.slice(0, 5)); // Print first 5 logs

    // Disconnect the machine ( don't do this when you need realtime update :))) 
    await zkInstance.disconnect();
}

test();
