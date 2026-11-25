// Servidor de teste contínuo para QA no navegador
process.env.DB_PATH = require('node:path').join(__dirname, 'data', 'qa.db');
process.env.PORT = 3200;
require('./server.js');
