var express = require('express');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var path = require('path');
var basePath = process.cwd();
var config = require(path.join(basePath,'.secret.json'));
var datos_config = JSON.parse(JSON.stringify(config));
var logout = require('express-passport-logout');
var expressLayouts = require('express-ejs-layouts');

var Dropbox = require('dropbox');
var dbx = new Dropbox({accessToken: datos_config.token_dropbox});
var bcrypt = require("bcrypt-nodejs");
var queries_bd = require(path.join(basePath,'public','js','queries.js'));
var users;
var datos;
var nombre_bd;
var error;

passport.use(new LocalStrategy(
  function(username, password, cb) {
      dbx.sharingGetSharedLinkFile({ url: datos_config.link_bd})
          .then(function(data)
          {
              // console.log("BODY:"+JSON.stringify(data));
              nombre_bd = data.name;
              console.log("NAME:"+nombre_bd);
              // console.log("Users:"+JSON.stringify(data.fileBinary));
              datos = JSON.parse(data.fileBinary);
              console.log("Datos:"+datos);

              users = datos.users;

              console.log("USERS:"+users);


              queries_bd.findByUsername(datos.users,username, function(err, usuario)
              {
                if(err)
                {
                  return cb(err);
                }
                if(!usuario){
                  console.log("El usuario no se encuentra en la base de datos");
                  return cb(null,false);
                }

                try {
                  if(bcrypt.compareSync(password, usuario.password) == false)
                  {
                    console.log("Password incorrecto");
                    return cb(null,false);
                  }
                  else
                  {
                      console.log("TODO OK");
                      return cb(null,usuario);
                  }
                } catch (e) {
                  console.log("error:"+e);
                  if(password == usuario.password)
                  {
                    //No está encriptada
                      var new_password = password;
                      var hash = bcrypt.hashSync(new_password);

                      for(var i=0,len = users.length; i < len; i++)
                      {
                        //  console.log("i:"+i, "Name:"+users[i].username);
                         if(users[i].username == username)
                         {
                          //  console.log("ENCONTRADO");
                           users[i].password = hash;
                           break;
                         }
                      }

                      actualizando_bd().then((resolve,reject)=>
                      {
                        console.log("RESOLVE:"+JSON.stringify(resolve));
                        console.log("REJECT:"+JSON.stringify(reject));
                        if(reject != null)
                        {
                          error = "No se encuentra el usuario";
                          return cb(null,false);
                        }
                      });

                      return cb(null,usuario);
                  }
                  return cb(null,false);
                }
              });
          })
          .catch(function(err)
          {
              console.error(err);
          });
  }
));

passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
    cb(null,obj);
});

// Create a new Express application.
var app = express();

// Configure view engine to render EJS templates.
app.use(express.static(path.join(__dirname,'gh-pages/')));
app.use(express.static(path.join(__dirname,'public/')));
app.set("views", __dirname+'/views');
app.set('view engine', 'ejs');
app.use(expressLayouts);

// Use application-level middleware for common functionality, including
// logging, parsing, and session handling.
app.use(require('morgan')('combined'));
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: 'keyboard cat', resave: true, saveUninitialized: true }));

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());

// Define routes.
app.get('/',
  function(req, res) {
    console.log("Usuario:"+req.user);
    if(datos_config.authentication == 'Yes' && req.user == null)
    {
      res.render('home');
    }
    else
    {
      res.redirect('/inicio_gitbook');
    }
});

app.post('/login',
  passport.authenticate('local', {failureRedirect: '/error'}),
  function(req,res) {
	res.render('login', {user: req.user});
});

app.get('/change_password', function(req,res)
{
    res.render('changing_password',{user: req.user});
});

app.post('/change_password_return', function(req,res)
{
  if(bcrypt.compareSync(req.body.old_pass, req.body.password))
  {
  actualizando_password(req.body.new_pass,req.body.username).then((resolve,reject) =>
  {
    console.log("Comprobar password return");
    if(reject != null)
    {
      res.redirect('/error');
    }
    else
    {
      actualizando_bd().then((resolve,reject)=>
      {
        console.log("RESOLVE:"+JSON.stringify(resolve));
        console.log("REJECT:"+JSON.stringify(reject));
        if(reject != null)
        {
          error = "Su password no se ha podido cambiar. Inténtelo de nuevo";
          res.redirect('/error');
        }
        res.render('login', {user: req.user});
      });
      return false;
    }
  });
  }
  else
  {
    error = "Password incorrecto";
    res.redirect('/error');
  }
});

app.get('/inicio_gitbook', function(req,res)
{
    res.sendFile(path.join(__dirname,'gh-pages','introduccion.html'));
});

app.get('/registro', function(req,res)
{
    res.render('registro.ejs');
});

app.post('/registro_return', function(req, res)
{
    //Cargamos la base de datos --> podriamos modularizarlo
    // console.log("Username:"+req.body.username);
    // console.log("Password:"+req.body.password);
    // console.log("displayName:"+req.body.displayName);

    var new_password = req.body.password;
    var hash = bcrypt.hashSync(new_password);

    console.log("hash:"+hash);

    descarga_bd().then((resolve,reject) =>
    {
          console.log("Usuarios promesa:"+JSON.stringify(resolve));

          // actualizando_bd(req.query.username,hash,req.query.displayName);
          //ACTUALIZAMOS CONTENIDO DE USERS
          users.push({
            "username": req.body.username,
            "password": hash,
            "displayName": req.body.displayName
          });

          actualizando_bd().then((resolve,reject)=>
          {
            console.log("RESOLVE:"+JSON.stringify(resolve));
            console.log("REJECT:"+JSON.stringify(reject));
            if(reject != null)
            {
              res.redirect('/');
            }
            res.redirect('/');
          });
    });
});

app.get('/borrar_cuenta', function(req,res)
{
    descarga_bd().then((resolve,reject) =>
    {
        if(resolve != null)
        {
          console.log("Usuario en borrar_cuenta:"+req.user.username);

          for(var i=0,len = users.length; i < len; i++)
          {
            var record = users[i];
            console.log("RECORD:"+JSON.stringify(record));
            if(record.username == req.user.username)
            {
              console.log("ENCONTRADO PA BORRAR");
              delete users.splice(i,1);
              break;
            }
          }
          console.log("Users:"+JSON.stringify(users));

          actualizando_bd().then((resolve,reject)=>
          {
            console.log("RESOLVE:"+JSON.stringify(resolve));
            console.log("REJECT:"+JSON.stringify(reject));
            if(reject != null)
            {
              error = "Error al borrar la cuenta";
              res.redirect('/error');
            }
            res.redirect('/logout');
          });
        }
    });
});

app.get('/error', function(req, res)
{
    console.log("Info del usuario:"+req.user);
    var respuesta = error || "No se ha podido realizar la operación";
    res.render('error', { error: "Imposible el acceso. No se encuentra el usuario."});
});

app.get('/logout',function(req,res){
  req.logout();
  req.session.destroy();
  res.redirect('/');
});

var descarga_bd = (() =>
{
  return new Promise((resolve,reject)=>
  {
    console.log("descarga_bd");
    if(users == null)
    {
      dbx.sharingGetSharedLinkFile({ url: datos_config.link_bd})
        .then(function(data)
        {
          console.log("hola");
          nombre_bd = data.name;
          datos = JSON.parse(data.fileBinary);
          users = datos.users;
          resolve(users);
        })
        .catch(function(err)
        {
          console.log(err);
        });
    }
    else
    {
        resolve(users);
    }
  });
});

var actualizando_bd = (() =>
{
    //SUBIMOS FICHERO A DROPBOX
    return new Promise((resolve,reject) =>
    {
      try {
        dbx.filesUpload({path: '/'+nombre_bd, contents: JSON.stringify(datos), mode: "overwrite"})
          .then(function(response)
          {
            console.log("RESPONSE:"+JSON.stringify(response));
            resolve(response);
          });
      } catch (err) {
        console.log("ERROR:"+JSON.stringify(err));
        error = "No se ha podido actualizar la Base de Datos en Dropbox";
        reject(error);
      }
    });
});

var actualizando_password = ((new_pass, username)=>
{
  return new Promise((resolve,reject) =>
  {
    console.log("Comprobar password");
    console.log("New_pass:"+new_pass);
    console.log("Username:"+username);
    var new_password = new_pass;
    var hash = bcrypt.hashSync(new_password);

    for(var i=0,len = users.length; i < len; i++)
    {
       console.log("i:"+i, "Name:"+users[i].username);
       if(users[i].username == username)
       {
         console.log("ENCONTRADO");
         users[i].password = hash;
         resolve(datos);
        //  break;
       }
    }
  });
});

app.listen(process.env.PORT || 8080);

module.exports = app;
