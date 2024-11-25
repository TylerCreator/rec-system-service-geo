const servicesRouter = require('express').Router();
const {
  getServices,
  updateServices,
  getRecomendations
} = require('../controllers/services');

servicesRouter.route('/').get(getServices);
servicesRouter.route('/getRecomendations').get(getRecomendations);



module.exports = servicesRouter;
