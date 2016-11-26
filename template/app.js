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
var users;
var datos;
var nombre_bd;

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

              var queries_bd = require(path.join(basePath,'public','js','queries.js'));

              queries_bd.findByUsername(datos.users,username, function(err, usuario)
              {
                console.log("USUARIO:"+usuario.username+",passs:"+usuario.password);
                console.log("password:"+password);
                if(err)
                {
                  console.log("1");
                  throw err;
                  return cb(err);
                }
                if(!usuario){
                  console.log("El usuario no se encuentra en la base de datos");
                  return cb(null,false);
                }
                console.log("Usuario encontrado:"+JSON.stringify(usuario));

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
                      console.log("EAAA");
                      var new_password = password;
                      var hash = bcrypt.hashSync(new_password);

                      for(var i=0,len = users.length; i < len; i++)
                      {
                         console.log("i:"+i, "Name:"+users[i].username);
                         if(users[i].username == username)
                         {
                           console.log("ENCONTRADO");
                           users[i].password = hash;
                           break;
                         }
                      }

                      dbx.filesUpload({path: '/'+nombre_bd, contents: JSON.stringify(datos), mode: "overwrite"})
                        .then(function(response)
                        {
                          console.log("Response:"+JSON.stringify(response));
                        })
                        .catch(function(err)
                        {
                          console.error(err);
                        });

                        return cb(null,usuario);
                  }
                  return cb(null,false);
                }
                return cb(null,usuario);
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

app.get('/login',
  passport.authenticate('local', {failureRedirect: '/error'}),
  function(req,res) {
	res.render('login', {user: req.user});
});

app.get('/change_password', function(req,res)
{
    res.render('changing_password',{user: req.user});
});

app.get('/change_password/return', function(req,res)
{
    var new_password = req.query.new_pass;
    var hash = bcrypt.hashSync(new_password);
    var new_password_encripted = bcrypt.compareSync(new_password, hash);
    
    console.log("hash:"+hash);
    //ACTUALIZAMOS CONTENIDO DE USERS
    for(var i=0,len = users.length; i < len; i++)
    {
       if(users[i].username == req.user.username)
       {
         users[i].password = hash;
         break;
       }
    }
    //SUBIMOS FICHERO A DROPBOX
    dbx.filesUpload({path: '/'+nombre_bd, contents: JSON.stringify(datos), mode: "overwrite"})
	.then(function(response)
	{
		res.redirect('/');
	})
	.catch(function(err)
	{
		console.log(err);
	});
	return false;
});

app.get('/inicio_gitbook', function(req,res)
{
    res.sendFile(path.join(__dirname,'gh-pages','introduccion.html'));
});

app.get('/error', function(req, res)
{
    console.log("Info del usuario:"+req.user);
    res.render('error', { error: "Imposible el acceso. No se encuentra el usuario."});
});

app.get('/logout',function(req,res){
  req.logout();
  req.session.destroy();
  res.redirect('/');
});


app.listen(process.env.PORT || 8080);

module.exports = app;
