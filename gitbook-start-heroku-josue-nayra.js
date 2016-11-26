"use strict"

const basePath = process.cwd();
const fs = require('fs-extra');
const path = require('path');
var exec = require('child_process').exec;
const pkj = require(path.join(basePath, 'package.json'));
const git = require('simple-git');
const Heroku = require('heroku-client');
const inquirer = require('inquirer');
var Dropbox = require('dropbox');
var dbx;
var heroku;
const jsonfile = require('jsonfile');

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
             `\n       require("gitbook-start-heroku-josue-nayra").deploy();`+
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

var build_tokenHeroku = (() =>
{
  return new Promise((resolve,reject)=>
  {
    exec('heroku auth:token', ((error, stdout, stderr) =>
    {
      if (error)
      {
        console.error("Error:"+JSON.stringify(error));
        throw error;
      }

      // console.log("Token heroku:"+stdout);

      var aux = stdout.replace("\n","");
      var datos = { token_heroku : aux };

      // console.log("Datos:"+datos);

      jsonfile.spaces = 10;
      jsonfile.writeFileSync(path.join(process.env.HOME,'.heroku','heroku.json'),datos,{spaces: 10});
      resolve(stdout);
    }));
  });
});


//-------------------------------------------------------------------------------------------------

var get_tokenHeroku = (() =>
{
    return new Promise((result,reject)=>
    {
      if(fs.existsSync(path.join(process.env.HOME,'.heroku')))
      {
          if(fs.existsSync(path.join(process.env.HOME,'.heroku','heroku.json')))
          {
            fs.readFile(path.join(process.env.HOME,'.heroku','heroku.json'), (err,data) =>
            {
                if(err)
                {
                  throw err;
                }

                var datos = JSON.parse(data);
                result(datos.token_heroku);
            });
          }
          else
          {
              build_tokenHeroku().then((resolve,reject) =>
              {
                 //Construyo el heroku.json
                 result(resolve);
              });
          }
      }
      else
      {
          fs.mkdirp(path.join(process.env.HOME,'.heroku'), (err) =>
          {
              if(err)
                throw err;

              build_tokenHeroku().then((resolve,reject) =>
              {
                  //Construyo heroku.json
                  result(resolve);
              });
          });
      }
    });
});

//-------------------------------------------------------------------------------------------------

var get_AppName = (() =>
{
    return new Promise((resolve,reject) =>
    {
        if((pkj.Heroku.nombre_app).match(/\S/g))
        {
            resolve(pkj.Heroku.nombre_app);
        }
        else
        {
            var schema = [
              {
                name: 'nombre_app',
                message: "Enter HerokuApp Name:"
              }
            ];

            inquirer.prompt(schema).then((respuestas) =>
            {
                //Escribir en el package.json
                fs.readFile(path.join(basePath,'package.json'),(err,data) =>
                {
                    if(err)
                      throw err;

                    var datos = JSON.parse(data);

                    datos.Heroku.nombre_app = respuestas.nombre_app;

                    jsonfile.spaces = 10;
                    jsonfile.writeFileSync(path.join(basePath,'package.json'),datos,{spaces: 10});
                });

                resolve(respuestas.nombre_app);
            });
        }
    });
});

//-------------------------------------------------------------------------------------------------

var get_AppsHeroku = ((Appname)=>
{
    return new Promise((resolve,reject)=>
    {
      var res = true;
      heroku.get('/apps').then(apps => {
          for(var d in apps)
          {
            if(Appname == apps[d].name)
            {
              res = false;
            }
          }
          resolve(res);
      });
    });
});

//-------------------------------------------------------------------------------------------------

var crear_app = (() => {
  return new Promise((result,reject) => {

    get_tokenHeroku().then((resolve, reject) =>
    {
      heroku = new Heroku({ token: resolve });

      get_AppName().then((resolve1,reject1) =>
      {
        get_AppsHeroku(resolve1).then((resolve2,reject2) =>
        {
          if(resolve2 != false){
             	    heroku.post('/apps', {body: {name: resolve1}})
                    .then((app) => {
                      var respuesta = JSON.stringify(app);
                      var respuesta1 = JSON.parse(respuesta);
                      var git_url = respuesta1.git_url;
                      console.log("Git url:"+respuesta1.git_url);
                      git()
                        .init()
                        .add('./*')
                        .commit("Deploy to Heroku")
                        .addRemote('heroku', git_url);

                      console.log("Creando app.js y Procfile");
                      fs.copy(path.join(__dirname,'template','app.js'), path.join(basePath, 'app.js'));
                      fs.copy(path.join(__dirname,'template','Procfile'), path.join(basePath, 'Procfile'));

                      fs.copy(path.join(__dirname,'template','views'), path.join(basePath,'views'), (err) =>
                      {
                      	if(err)
                      	{
                      	  console.log(err);
                      	  throw err;
                      	}
                      });

                      //Copiamos ficheros necesarios para el uso de materialize
                      fs.copy(path.join(__dirname,'template','public'), path.join(basePath, 'public'), (err) =>
                      {
                      	if(err)
                      	{
                      	  console.log("Error:"+err);
                      	  throw err;
                      	}
                      });

                      result(respuesta1.git_url);
          	    })
        	      .catch((e) =>
        	      {
                  console.log("Error:"+e);
            			console.log("Pruebe a realizar las siguientes acciones:");
            			console.log("1.-Cambie el nombre de su app");
            			console.log("2.-Compruebe que el número de aplicaciones en su cuenta de Heroku es menor que el máximo permitido");
                  console.log("3.-Vuelva a ejecutar el comando gitbook-start --deploy heroku");
        		      throw e;
                });
          }
          else {
            console.log("Nombre de aplicación no disponible...");
          }

        });

      });
    });
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
              crear_app().then((resolve,reject) =>
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
