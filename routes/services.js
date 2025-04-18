const servicesRouter = require('express').Router();
const cors = require('cors');
const {
  getServices,
  updateServices,
  getRecomendations,
  getRecomendation,
} = require('../controllers/services');

servicesRouter.route('/').get(getServices);
servicesRouter.route('/getRecomendations').get(getRecomendations);
servicesRouter.route('/getRecomendation').get(getRecomendation);



module.exports = servicesRouter;
