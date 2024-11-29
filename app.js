/* eslint-disable linebreak-style */
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const nocache = require('nocache');
const cron = require('node-cron');
const morgan = require('morgan');

const {
  NODE_DOCKER_PORT: PORT = 8080,
} = process.env;

const sequelize = require('./db');
const callsRouter = require('./routes/calls.js');
const servicesRouter = require('./routes/services.js');
const updateRouter = require('./routes/update.js')
const compositionsRouter = require('./routes/compositions.js')
const {
  updateAll,
  updateStatics,
  updateRecomendations,
} = require('./controllers/update');
const { dumpCsv } = require('./controllers/calls.js');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(morgan('dev'));

app.use(nocache());
app.set('etag', false);

app.get('/', (req, res)=> {
    console.log('getted')
    res.status(200).send({message: 'hello'})
})

app.use('/calls', callsRouter);
app.use('/services', servicesRouter);
app.use('/update', updateRouter );
app.use('/compositions', compositionsRouter );

app.use('/:404', (req, res, next) => {
  res.status(404).send({ message: 'страница не найдена' });
  next();
});

// axios.defaults.timeout = 30000;
// axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });

const start = async () => {
  try {
      await sequelize.authenticate()
      await sequelize.sync()
      app.listen(PORT, () => console.log(`Server started on port ${PORT}`))

      cron.schedule('0 1 * * *', async () => {
        await updateAll();
        await updateStatics();
        await dumpCsv();
        await updateRecomendations();
      }, {
        scheduled: true,
        timezone: "Asia/Irkutsk"
      });
  } catch (e) {
      console.log(e)
  }
}

start()