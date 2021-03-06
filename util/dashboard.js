/* 
DASHBOARD EXAMPLE

  Install the following for dashboard stuff.
  npm install body-parser ejs express express-passport express-session
  npm install level-session-store marked passport passport-discord
  
This is a very simple dashboard example, but even in its simple state, there are still a
lot of moving parts working together to make this a reality. I shall attempt to explain
those parts in as much details as possible, but be aware: there's still a lot of complexity
and you shouldn't expect to really understand all of it instantly.

Pay attention, be aware of the details, and read the comments. 

Note that this *could* be split into multiple files, but for the purpose of this
example, putting it in one file is a little simpler. Just *a little*.
*/

// Native Node Imports
const url = require("url");
const path = require("path");

// Used for Permission Resolving...
const Discord = require("discord.js");

// Express Session
const express = require("express");
const app = express();

const moment = require("moment");
require("moment-duration-format");

//init db and other things 
const admin = require('firebase-admin');
let db = admin.firestore();
const fs = require('fs');
// Express Plugins
// Specifically, passport helps with oauth2 in general.
// passport-discord is a plugin for passport that handles Discord's specific implementation.
// express-session and level-session-store work together to create persistent sessions
// (so that when you come back to the page, it still remembers you're logged in).
const passport = require("passport");
const session = require("express-session");
const MongoStore = require('connect-mongo')(session);
const Strategy = require("passport-discord").Strategy;
//var favicon = require('serve-favicon');
//app.use(express.static('../assets/img/'));
//app.use(favicon(path.join(__dirname + '/../assets/img/azooid.ico')));
// Helmet is specifically a security plugin that enables some specific, useful 
// headers in your page to enhance security.
const helmet = require("helmet");

// Used to parse Markdown from things like ExtendedHelp
const md = require("marked");
let {
  duration
} = require('yet-another-duration');
const {
  Utils
} = require("erela.js")
const {
  default: convertSize
} = require('convert-size');
module.exports = async (client) => {
  // It's easier to deal with complex paths. 
  // This resolves to: yourbotdir/dashboard/
  const dataDir = path.resolve(`${process.cwd()}${path.sep}dashboard`);

  // This resolves to: yourbotdir/dashboard/templates/ 
  // which is the folder that stores all the internal template files.
  const templateDir = path.resolve(`${dataDir}${path.sep}templates`);

  // The public data directory, which is accessible from the *browser*. 
  // It contains all css, client javascript, and images needed for the site.
  app.use("/public", express.static(path.resolve(`${dataDir}${path.sep}public`)));
  // These are... internal things related to passport. Honestly I have no clue either.
  // Just leave 'em there.
  passport.serializeUser((user, done) => {
    done(null, user);
  });
  passport.deserializeUser((obj, done) => {
    done(null, obj);
  });

  /* 
  This defines the **Passport** oauth2 data. A few things are necessary here.
  
  clientID = Your bot's client ID, at the top of your app page. Please note, 
    older bots have BOTH a client ID and a Bot ID. Use the Client one.
  clientSecret: The secret code at the top of the app page that you have to 
    click to reveal. Yes that one we told you you'd never use.
  callbackURL: The URL that will be called after the login. This URL must be
    available from your PC for now, but must be available publically if you're
    ever to use this dashboard in an actual bot. 
  scope: The data scopes we need for data. identify and guilds are sufficient
    for most purposes. You might have to add more if you want access to more
    stuff from the user. See: https://discordapp.com/developers/docs/topics/oauth2 

  See config.js.example to set these up. 
  */
  passport.use(new Strategy({
      clientID: client.appInfo.id,
      clientSecret: client.config.dashboard.oauthSecret,
      callbackURL: client.config.dashboard.callbackURL,
      scope: ["identify", "guilds"]
    },
    (accessToken, refreshToken, profile, done) => {
      process.nextTick(() => done(null, profile));
    }));


  // Session data, used for temporary storage of your visitor's session information.
  // the `secret` is in fact a "salt" for the data, and should not be shared publicly.
  app.use(session({
    store: new MongoStore({
      url: client.config.mongo
    }),
    secret: client.config.dashboard.sessionSecret,
    resave: false,
    saveUninitialized: false,
  }));

  // Initializes passport and session.
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(helmet());

  // The domain name used in various endpoints to link between pages.
  app.locals.domain = client.config.dashboard.domain;

  // The EJS templating engine gives us more power to create complex web pages. 
  // This lets us have a separate header, footer, and "blocks" we can use in our pages.
  app.engine("html", require("ejs").renderFile);
  app.set("view engine", "html");

  // body-parser reads incoming JSON or FORM data and simplifies their
  // use in code.
  var bodyParser = require("body-parser");
  app.use(bodyParser.json()); // to support JSON-encoded bodies
  app.use(bodyParser.urlencoded({ // to support URL-encoded bodies
    extended: true
  }));

  /* 
  Authentication Checks. For each page where the user should be logged in, double-checks
  whether the login is valid and the session is still active.
  */
  function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.session.backURL = req.url;
    res.redirect("/login");
  }
  let prefix, welcomeChannelID, playervolume, logchannel, voicelogchannel, defaultchannelID, guildautorole, logging;
  var timeout = require('connect-timeout');

  // This function simplifies the rendering of the page, since every page must be rendered
  // with the passing of these 4 variables, and from a base path. 
  // Objectassign(object, newobject) simply merges 2 objects together, in case you didn't know!
  const renderTemplate = (res, req, template, data = {}) => {
    const baseData = {
      bot: client,
      path: req.path,
      user: req.isAuthenticated() ? req.user : null
    };
    res.render(path.resolve(`${templateDir}${path.sep}${template}`), Object.assign(baseData, data));
  };


  /** PAGE ACTIONS RELATED TO SESSIONS */

  //Site Map generated from a url
  app.get('/sitemap.xml', function (req, res) {
    res.sendFile('public/sitemap.xml');
  });
  // The login page saves the page the person was on in the session,
  // then throws the user to the Discord OAuth2 login page.
  app.get("/login", (req, res, next) => {
      if (req.session.backURL) {
        req.session.backURL = req.session.backURL;
      } else if (req.headers.referer) {
        const parsed = url.parse(req.headers.referer);
        if (parsed.hostname === app.locals.domain) {
          req.session.backURL = parsed.path;
        }
      } else {
        req.session.backURL = "/";
      }
      next();
    },
    passport.authenticate("discord"));

  // Once the user returns from OAuth2, this endpoint gets called. 
  // Here we check if the user was already on the page and redirect them
  // there, mostly.
  app.get("/callback", passport.authenticate("discord", {
    failureRedirect: "/autherror"
  }), (req, res) => {
    if (req.user.id === client.appInfo.owner.id) {
      req.session.isAdmin = true;
    } else {
      req.session.isAdmin = false;
    }
    if (req.session.backURL) {
      const url = req.session.backURL;
      req.session.backURL = null;
      res.redirect(url);
    } else {
      res.redirect("/");
    }
  });

  // If an error happens during authentication, this is what's displayed.
  app.get("/autherror", (req, res) => {
    renderTemplate(res, req, "autherror.ejs");
  });

  // Destroys the session to log out the user.
  app.get("/logout", function (req, res) {
    req.session.destroy(() => {
      req.logout();
      res.redirect("/"); //Inside a callback… bulletproof!
    });
  });

  /** REGULAR INFORMATION PAGES */

  // Index page. If the user is authenticated, it shows their info
  // at the top right of the screen.
  app.get("/", (req, res) => {
    renderTemplate(res, req, "index.ejs");
  });


  // The list of commands the bot has. Current **not filtered** by permission.
  app.get("/commands", (req, res) => {
    renderTemplate(res, req, "commands.ejs", {
      md
    });
  });
  app.use(timeout(120000));
  app.use(haltOnTimedout);

  function haltOnTimedout(req, res, next) {
    if (!req.timedout) next();
  }

  app.get("/profile", checkAuth, async (req, res) => {
    renderTemplate(res, req, "guild/profile.ejs");
  })
  app.get("/license", (req, res) => {
    renderTemplate(res, req, "license.ejs");
  });
  // Bot statistics. Notice that most of the rendering of data is done through this code, 
  // not in the template, to simplify the page code. Most of it **could** be done on the page.
  app.get("/stats", (req, res) => {
    const duration = moment.duration(client.uptime).format(" D [days], H [hrs], m [mins], s [secs]");
    const members = client.guilds.cache.reduce((p, c) => p + c.memberCount, 0);
    const textChannels = client.channels.cache.filter(c => c.type === "text").size;
    const voiceChannels = client.channels.cache.filter(c => c.type === "voice").size;
    const guilds = client.guilds.cache.size;
    const player = client.music.nodes.get(1).stats
    const uptime = Utils.formatTime(player.uptime || 1)
    const free = convertSize(player.memory.free, "GB", {
      stringify: true
    })
    const used = convertSize(player.memory.used, "GB", {
      stringify: true
    })
    const players = player.players
    const playing = player.playingPlayers
    renderTemplate(res, req, "stats.ejs", {
      stats: {
        servers: guilds,
        members: members,
        text: textChannels,
        voice: voiceChannels,
        uptime: duration,
        memoryUsage: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        dVersion: Discord.version,
        nVersion: process.version,
        time: uptime,
        free: free,
        used: used,
        players: players,
        playing: playing
      }
    });
  });
  app.get("/stats/data", (req, res) => {
    const duration = moment.duration(client.uptime).format(" D [days], H [hrs], m [mins], s [secs]");
    const members = client.guilds.cache.reduce((p, c) => p + c.memberCount, 0);
    const textChannels = client.channels.cache.filter(c => c.type === "text").size;
    const voiceChannels = client.channels.cache.filter(c => c.type === "voice").size;
    const guilds = client.guilds.cache.size;
    const player = client.music.nodes.get(1).stats
    const uptime = Utils.formatTime(player.uptime || 1)
    const free = convertSize(player.memory.free, "GB", {
      stringify: true
    })
    const used = convertSize(player.memory.used, "GB", {
      stringify: true
    })
    const players = player.players
    const playing = player.playingPlayers
    const returnObject = [];

    returnObject.push({
      servers: guilds,
      members: members,
      text: textChannels,
      voice: voiceChannels,
      uptime: duration,
      memoryUsage: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
      time: uptime,
      free: free,
      used: used,
      players: players,
      playing: playing
    });

    res.json({
      data: returnObject
    });


  });
  app.get("/dashboard", checkAuth, (req, res) => {
    const perms = Discord.Permissions;
    renderTemplate(res, req, "dashboard.ejs", {
      perms
    });
  });
  app.get("/troubleshoot", checkAuth, (req, res) => {

    renderTemplate(res, req, "troubleshoot.ejs");
  });

  // The Admin dashboard is similar to the one above, with the exception that
  // it shows all current guilds the bot is on, not *just* the ones the user has
  // access to. Obviously, this is reserved to the bot's owner for security reasons.
  app.get("/admin", checkAuth, (req, res) => {
    if (!req.session.isAdmin) return res.redirect("/");
    renderTemplate(res, req, "admin.ejs");
  });

  // Simple redirect to the "Settings" page (aka "manage")
  app.get("/dashboard/:guildID", checkAuth, (req, res) => {
    res.redirect(`/dashboard/${req.params.guildID}/manage`);
  });

  // Settings page to change the guild configuration. Definitely more fancy than using
  // the `set` command!
  app.get("/dashboard/:guildID/manage", checkAuth, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildID);
    await db.collection('guilds').doc(req.params.guildID).get().then((q) => {
      if (q.exists) {
        prefix = q.data().prefix || config1.prefix_mention;
        welcomeChannelID = q.data().welcomeChannelID || 'default';
        playervolume = q.data().playervolume || 100;
        logchannel = q.data().logchannel || 'default';
        voicelogchannel = q.data().voicelogchannel || 'default';
        defaultchannelID = q.data().defaultchannelID || 'default';
        guildautorole = q.data().guildautorole || 'default';
        logging = q.data().log || false;
      } else {
        prefix = ".";
        welcomeChannelID = 'default';
        playervolume = 100;
        logchannel = 'default';
        voicelogchannel = 'default';
        defaultchannelID = 'default';
        guildautorole = 'default';
        logging = false;
      }
    })
    if (!guild) return res.status(404);
    const isManaged = guild && !!guild.member(req.user.id) ? guild.member(req.user.id).permissions.has("MANAGE_GUILD") : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");
    await renderTemplate(res, req, "guild/manage.ejs", {
      guild,
      prefix,
      welcomeChannelID,
      playervolume,
      logchannel,
      voicelogchannel,
      defaultchannelID,
      guildautorole,
      logging
    });
  });

  // When a setting is changed, a POST occurs and this code runs
  // Once settings are saved, it redirects back to the settings page.
  app.post("/dashboard/:guildID/manage", checkAuth, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildID);
    if (!guild) return res.status(404);
    const isManaged = guild && !!guild.member(req.user.id) ? guild.member(req.user.id).permissions.has("MANAGE_GUILD") : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");
    if (welcomeChannelID !== `<#${(req.body.welcomeChannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`) welcomeChannelID = `<#${(req.body.welcomeChannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`
    if (logchannel !== `<#${(req.body.logchannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`) logchannel = `<#${(req.body.logchannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`
    if (voicelogchannel !== `<#${(req.body.voicelogchannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`) voicelogchannel = `<#${(req.body.voicelogchannelID).replace(/[^0-9a-zA-Z_]/g, '') }>`
    if (defaultchannelID !== `<#${(req.body.defaultchannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`) defaultchannelID = `<#${(req.body.defaultchannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`
    if (guildautorole !== `<@${(req.body.guildautoroleID).replace(/[^0-9a-zA-Z_]/g, '')}>`) guildautorole = `<@${(req.body.guildautoroleID).replace(/[^0-9a-zA-Z_]/g, '')}>`
    if (logging == true) {
      logging = true
    } else logging = false
    db.collection('guilds').doc(guild.id).update({
      'prefix': req.body.Prefix,
      'welcomeChannelID': welcomeChannelID.slice(2, -1),
      'logchannel': logchannel.slice(2, -1),
      'voicelogchannel': voicelogchannel.slice(2, -1),
      'guildautorole': guildautorole.slice(2, -1),
      'defaultchannelID': defaultchannelID.slice(2, -1),
      'playervolume': req.body.playervolume,
      'log': logging
    })
    load()
    load()
    res.redirect("/dashboard/" + req.params.guildID + "/manage");
  });

  // Displays the list of members on the guild (paginated).
  // NOTE: to be done, merge with manage and stats in a single UX page.
  app.get("/dashboard/:guildID/members", checkAuth, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildID);
    if (!guild) return res.status(404);
    renderTemplate(res, req, "guild/members.ejs", {
      guild: guild,
      members: guild.members.cache.array()
    });
  });

  // This JSON endpoint retrieves a partial list of members. This list can
  // be filtered, sorted, and limited to a partial count (for pagination).
  // NOTE: This is the most complex endpoint simply because of this filtering
  // otherwise it would be on the client side and that would be horribly slow.
  app.get("/dashboard/:guildID/members/list", checkAuth, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildID);
    if (!guild) return res.status(404);
    if (req.query.fetch) {
      await guild.members.fetchs();
    }
    const totals = guild.members.size;
    const start = parseInt(req.query.start, 10) || 0;
    const limit = parseInt(req.query.limit, 10) || 50;
    let members = guild.members.cache;
    if (req.query.filter && req.query.filter !== "null") {
      if (!req.query.filtervalue) return res.status(400);
      members = members.filter(m => {
        m = req.query.filterUser ? m.user : m;
        return m["displayName"].toLowerCase().includes(req.query.filter.toLowerCase());
      });
    }

    if (req.query.sortby) {
      members = members.sort((a, b) => a[req.query.sortby] > b[req.query.sortby]);
    }
    const memberArray = members.array().slice(start, start + limit);

    const returnObject = [];
    for (let i = 0; i < memberArray.length; i++) {
      const m = memberArray[i];
      returnObject.push({
        id: m.id,
        status: m.user.presence.status,
        bot: m.user.bot,
        username: m.user.username,
        displayName: m.displayName,
        tag: m.user.tag,
        discriminator: m.user.discriminator,
        joinedAt: m.joinedTimestamp,
        createdAt: m.user.createdTimestamp,
        highestRole: {
          hexColor: m.roles.highest.hexColor
        },
        memberFor: moment.duration(Date.now() - m.joinedAt).format(" D [days], H [hrs], m [mins], s [secs]"),
        roles: m.roles.cache.map(r => ({
          name: r.name,
          id: r.id,
          hexColor: r.hexColor
        }))
      });
    }
    res.json({
      total: totals,
      page: (start / limit) + 1,
      pageof: Math.ceil(members.size / limit),
      members: returnObject
    });
  });
  app.get("/dashboard/:guildID/stats/json", checkAuth, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildID);
    if (!guild) return res.status(404);
    let player = client.music.players.get(req.params.guildID);
    let play, title, total, volume, repeat, queue, rep_queue, vschannel;
    if (player) {
      play = duration(player.position).toString();
    } else play = '00:00'
    if (player) {
      title = player.queue[0].title;
    } else title = 'No Songs playing in server.'
    if (player) {
      total = duration(player.queue[0].duration).toString();
    } else total = '00:00'
    if (player) {
      volume = player.volume
    } else volume = 100
    if (player) {
      player.trackRepeat ? repeat = 'ON' : repeat = 'OFF'
    } else repeat = 'OFF'
    if (player) {
      player.queueRepeat ? rep_queue = 'ON' : rep_queue = 'OFF'
    } else rep_queue = 'OFF'
    if (player) {
      queue = `${player.queue.length} songs in the Queue`
    } else queue = '0 Songs in the queue.'
    if (player) {
      vschannel = `${player.voiceChannel.name}  ( ${player.voiceChannel.id} )`
    } else vschannel = "Not connected to Voice Channel"

    const returnObject = [];

    returnObject.push({
      time: play,
      name: title,
      duration: total,
      volume: volume,
      repeat: repeat,
      rep_queue: rep_queue,
      queue: queue,
      vschannel: vschannel
    });

    res.json({
      data: returnObject
    });
  });

  // Displays general guild statistics. 
  app.get("/dashboard/:guildID/stats", checkAuth, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildID);
    let player = client.music.players.get(req.params.guildID);
    let time, play;
    if (player) {
      play = duration(player.position || '0').toString() || '00:00'
    } else play = '00:00'
    if (player) {
      time = duration(player.queue[0].duration || '0').toString() || '00:00'
    } else time = '00:00';
    if (!guild) return res.status(404);
    const isManaged = guild && !!guild.member(req.user.id) ? guild.member(req.user.id).permissions.has("MANAGE_GUILD") : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");
    load()
    renderTemplate(res, req, "guild/stats.ejs", {
      guild,
      player,
      play,
      time
    });
  });

  // Leaves the guild (this is triggered from the manage page, and only
  // from the modal dialog)
  app.get("/dashboard/:guildID/leave", checkAuth, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildID);
    if (!guild) return res.status(404);
    const isManaged = guild && !!guild.member(req.user.id) ? guild.member(req.user.id).permissions.has("MANAGE_GUILD") : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");
    await guild.leave();
    load()
    res.redirect("/dashboard");
  });

  // Resets the guild's settings to the defaults, by simply deleting them.
  app.get("/dashboard/:guildID/reset", checkAuth, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildID);
    if (!guild) return res.status(404);
    const isManaged = guild && !!guild.member(req.user.id) ? guild.member(req.user.id).permissions.has("MANAGE_GUILD") : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");

    db.collection('guilds').doc(req.params.guildID).set({
      'prefix': '.',
      'log': false,
      'welcomeChannelID': "default",
      'logchannel': 'default',
      'voicelogchannel': 'default',
      'guildautorole': 'default',
      'defaultchannelID': "default",
      'playervolume': 100
    })
    load()
    //client.settings.delete(guild.id);
    res.redirect("/dashboard/" + req.params.guildID);
  });
  app.post("/dashboard/:guildID/set", checkAuth, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildID);
    if (!guild) return res.status(404);
    const isManaged = guild && !!guild.member(req.user.id) ? guild.member(req.user.id).permissions.has("MANAGE_GUILD") : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");
    if (welcomeChannelID !== `<#${(req.body.welcomeChannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`) welcomeChannelID = `<#${(req.body.welcomeChannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`
    if (logchannel !== `<#${(req.body.logchannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`) logchannel = `<#${(req.body.logchannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`
    if (voicelogchannel !== `<#${(req.body.voicelogchannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`) voicelogchannel = `<#${(req.body.voicelogchannelID).replace(/[^0-9a-zA-Z_]/g, '') }>`
    if (defaultchannelID !== `<#${(req.body.defaultchannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`) defaultchannelID = `<#${(req.body.defaultchannelID).replace(/[^0-9a-zA-Z_]/g, '')}>`
    if (guildautorole !== `<@${(req.body.guildautoroleID).replace(/[^0-9a-zA-Z_]/g, '')}>`) guildautorole = `<@${(req.body.guildautoroleID).replace(/[^0-9a-zA-Z_]/g, '')}>`
    //if(logging == true){logging = true} else logging = false 
    db.collection('guilds').doc(guild.id).update({
      'prefix': req.body.prefix,
      'welcomeChannelID': welcomeChannelID.slice(2, -1),
      'logchannel': logchannel.slice(2, -1),
      'voicelogchannel': voicelogchannel.slice(2, -1),
      'guildautorole': guildautorole.slice(2, -1),
      'defaultchannelID': defaultchannelID.slice(2, -1),
      'playervolume': req.body.playervolume,

    })
    load()
    res.redirect("/dashboard/" + req.params.guildID);
  });
  app.get("/404", checkAuth, async (req, res) => {
    renderTemplate(res, req, "404.ejs");
  })
  app.get("/error", checkAuth, async (req, res) => {
    renderTemplate(res, req, "error.ejs");
  })

  // catch 404 and forward to error handler
  app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  });

  // when status is 404, error handler
  app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    if (404 === err.status) {
      return renderTemplate(res, req, "404.ejs");
    }

    // when status is 500, error handler
    if (500 === err.status) {
      return renderTemplate(res, req, "error.ejs");
    }
  });

  let port = client.config.dashboard.port || 5000
  app.set('port', client.config.dashboard.port || 5000);
  app.set('host', client.config.dashboard.domain || 'localhost');
  //client.site = app.listen(app.get('port') , () => console.log(`[log] [web] Dashboard is active on ${client.config.dashboard.port || 5000} and host is active on ${app.get("host")}:${app.get("port")}`) );
  app.listen(app.get('port'), app.get('host'), () => console.log(`[log] [web] Dashboard is active on ${client.config.dashboard.port || 5000} and host is active on ${app.get("host")}:${app.get("port")}`));

  function load() {
    let query = db.collection('guilds')
    let guilds = {} // plain object, not array   
    let promise = new Promise(async function (resolve) {

      await query.get().then(snapshot => {
        let remaining = snapshot.size; // If firebase, there is this property
        snapshot.forEach(doc => {
          guilds[doc.id] = doc.data();
          remaining--;
          if (!remaining) resolve(guilds);
        });
      })
    });
    promise.then(async function (guilds) {
      // do anything you like with guilds inside this function...
      let temp = {
        guilds
      };
      await fs.writeFileSync("./data/json/serversettings.json", JSON.stringify(temp), function (err) {
        if (err) throw err;

      })
    });
  }
};