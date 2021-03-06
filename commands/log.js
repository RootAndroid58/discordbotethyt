const Discord = require("discord.js");
const {
    stripIndents
} = require("common-tags");
const fs = require('fs');
const admin = require('firebase-admin');
let db = admin.firestore();
exports.run = async (client, message, args) => {
    if (!message.member.hasPermission('ADMINISTRATOR') || !message.author.id == '348832732647784460') return message.channel.send("you dont have admin rights contact server admin");
    let data = await fs.readFileSync("./data/json/serversettings.json", "utf8", function (err, data) {
        if (err) throw err;

    })
    data = JSON.parse(data)
    let guildID = message.guild.id
    let prefix = data['guilds'][guildID]['prefix'];
    let Pembed = new Discord.MessageEmbed()
        .setColor("e8a515")
        .setTitle(`Do you wish for two different channels for logging voice and other stuff`)
        .addField(`IF yes then use the command like this`, stripIndents `
                use ${prefix}log on/off [this will turn on the logging System]
                use ${prefix}log -v <#channelid> -o <#channelid> 
                where <#channelid> is just #channelname`)
        .addField(`IF not then use `, stripIndents `
                use ${prefix}log -a <#channelid>
                where <#channelid> is just #channel Name`);
    if (!args) return //message.channel.send(Pembed);
    if (args[0] == 'help' || args[0] == '-h') return message.channel.send(Pembed);

    let sEmbed = new Discord.MessageEmbed()
        .setColor("e8a515")
        .setTitle("Logging Setting successfully changed")
    if (args[0] == 'on' || args[0] == 'enable') {
        db.collection('guilds').doc(message.guild.id).update({
            'log': true
        }).then(() => {
            load();
            sEmbed.addField(`Logging is now `, `ON `);
            message.channel.send(sEmbed)
        })
    } else if (args[0] == 'off' || args[0] == 'disable') {
        db.collection('guilds').doc(message.guild.id).update({
            'log': false
        }).then(() => {
            load();
            sEmbed.addField(`Logging is now`, ` OFF `);
            message.channel.send(sEmbed)
        })
    } else if (args[0] == '-v' && args[2] == '-o' || args[0] == 'voice' && args[2] == 'other') {
        db.collection('guilds').doc(message.guild.id).update({
            'logchannel': args[1],
            'voicelogchannel': args[3],
            'log': true
        }).then(() => {
            load();
            sEmbed.addField(`New Logging channels are : `, stripIndents `
                log Channel : "${args[1]}"
                voice log Channel : "${args[3]}"
                Logging Enabled `);
            message.channel.send(sEmbed)
        })
    } else if (args[0] == '-a' || args[0] == 'all') {
        db.collection('guilds').doc(message.guild.id).update({
            'logchannel': args[1],
            'voicelogchannel': args[1]
        }).then(() => {
            load();
            sEmbed.addField(`New Logging channel is : `, stripIndents `
                log Channel : "${args[1]}"`);
            message.channel.send(sEmbed)
        })
    } else {
        message.channel.send(Pembed)
    }


    // await message.channel.send(sEmbed);



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

}

exports.conf = {
    enabled: true,
    guildOnly: true,
    aliases: ["setlog", "logchannel"],
    permLevel: "User"
};

exports.help = {
    name: "log",
    description: "change the logging channel of the server ",
    usage: "log -v <#channelid> -o <#channelid> or log -a <#channelid>",
    category: "System",
};