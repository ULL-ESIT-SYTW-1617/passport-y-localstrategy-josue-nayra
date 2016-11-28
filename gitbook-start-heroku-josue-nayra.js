"use strict"

const basePath = process.cwd();
const fs = require('fs-extra');
const path = require('path');
var exec = require('child_process').exec;
const pkj = require(path.join(basePath, 'package.json'));
const git = require('simple-git');
// const Heroku = require('heroku-client');
const inquirer = require('inquirer');
// var Dropbox = require('dropbox');
// var dbx;
// const jsonfile = require('jsonfile');

var heroku = require(path.join(__dirname,'lib','config_heroku.js'));

//-------------------------------------------------------------------------------------------------

var respuesta = ((error, stdout, stderr) =>
{
    if (error)
        console.error("Error:"+error);
    console.log("Stderr:"+stderr);
    console.log("Stdout:"+stdout);
});

//-------------------------------------------------------------------------------------------------

var deploy = (() => {
    console.log("Deploy to Heroku");
    exec('git add .; git commit -m "Deploy to Heroku"; git push heroku master', respuesta);
});

//-------------------------------------------------------------------------------------------------

var escribir_gulpfile = (() => {

  return new Promise((resolve,reject) => {
    var tarea_gulp = `\n\ngulp.task("deploy-heroku", function(){`+
             `\n       require("gitbook-start-heroku-P8-josue-nayra").deploy();`+
             `\n});`;

    fs.readFile('gulpfile.js', "utf8", function(err, data) {
        if (err) throw err;
        // console.log(data);
        if(data.search("deploy-heroku") != -1)
        {
          console.log("Ya existe una tarea de deploy-heroku");
        }
        else
        {
          // console.log("No existe una tarea de deploy-iaas-ull-es");
          fs.appendFile(path.join(basePath,'gulpfile.js'), `${tarea_gulp}`, (err) => {
            if (err) throw err;
              console.log("Escribiendo tarea en gulpfile para próximos despliegues");
          });
        }
    });

  });

});

//-------------------------------------------------------------------------------------------------

var get_token = ((dispone_bd) =>
{
  return new Promise((resolve,reject) =>
  {

      var schema =
      [
          {
            name: "token_dropbox",
            message: "Enter your Dropbox Token:"
          },
          {
            name: "link_bd",
            message: "Link to the Dropbox Database"
          },
          {
            name: "authentication",
            message: "Do you want to authentication?",
            type: 'list',
            default: 'Yes',
            choices: ['Yes', 'No']
          }
      ];

      inquirer.prompt(schema).then((respuestas) =>
      {
          resolve({"token_dropbox": respuestas.token_dropbox, "link_bd": respuestas.link_bd, "authentication": respuestas.authentication});
      });
  });
});

//-------------------------------------------------------------------------------------------------

var obtener_variables = (() =>
{
    return new Promise((result,reject) =>
    {
            get_token().then((resolve,reject) =>
            {
                  result(resolve);
            });
    });
});
//-------------------------------------------------------------------------------------------------

var generar_fileSecret = ((datos) =>
{
    return new Promise((resolve, reject) =>
    {
        var configuracion =
        `{ "token_dropbox": "${datos.token_dropbox}", "authentication": "${datos.authentication}", "link_bd": "${datos.link_bd}" }`;

        fs.writeFile(path.join(basePath,'.secret.json'), configuracion, (err) =>
        {
          if(err) throw err;
        });
        resolve(configuracion);
    });
});

//-------------------------------------------------------------------------------------------------
// Funcion para cambiar el nombre del index.html y evitar ambiguedades.

var preparar_despliegue = (() => {
  return new Promise((resolve, reject) => {
      if(fs.existsSync(path.join(basePath,'gh-pages','index.html')))
      {
        fs.rename(path.join(basePath,'gh-pages','index.html'), path.join(basePath,'gh-pages','introduccion.html'), (err) => {
          if (err) {
            console.log(err);
            throw err;
          }

          resolve(fs.existsSync(path.join(basePath,'gh-pages','introduccion.html')));
        });
      }
      else
      {

          if(fs.existsSync(path.join(basePath,'gh-pages','introduccion.html')))
          {

            resolve(fs.existsSync(path.join(basePath,'gh-pages','introduccion.html')));
          }
          else
          {
            console.log("No existe gh-pages... Debe ejecutar gulp build para construir el libro");
          }
      }
  });
});

//-------------------------------------------------------------------------------------------------

var initialize = (() => {
    console.log("Método initialize del plugin deploy-heroku");

    obtener_variables().then((resolve,reject) =>
    {
        // console.log("Obtener_variables:"+JSON.stringify(resolve));
        generar_fileSecret(resolve).then((resolve,reject) =>
        {
            // console.log("generar_fileSecret");
            preparar_despliegue().then((resolve, reject) =>
            {
              heroku.crear_app().then((resolve,reject) =>
              {
                    escribir_gulpfile();
              });
            });

        });
    });
});

//-------------------------------------------------------------------------------------------------

exports.initialize = initialize;
exports.deploy = deploy;
