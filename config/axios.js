const axios = require('axios')
const https = require('https')
let instance

module.exports = function getAxios()
{
    if (!instance)
    {
        //create axios instance
        instance = axios.create({
            timeout: 60000, //optional
            httpsAgent: new https.Agent({ keepAlive: true }),
            headers: {'Content-Type':'json'}
        })
    }

    return instance;
}