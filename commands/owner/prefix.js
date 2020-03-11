const Discord = require("discord.js");
const { stripIndents } = require("common-tags");
const fs = require('fs');

module.exports = {
    name: "prefix",
    category: "owner",
    description: "change prefix of the server ",
    run: async (client, message, args,db) => {
        if(!message.member.hasPermission('ADMINISTRATOR')) return message.channel.send("you dont have admin rights contact server admin");
        if(!args[0]) return message.channel.send("please enter server prefix");
        //message.channel.send(`sry for intrusion but this command is yet to be applied but it can save the prefix in our database`);
        let nPrefix = args[0];
        db.collection('guilds').doc(message.guild.id).update({
            'prefix': nPrefix
        }).then(() => {
            message.channel.send(sEmbed);
            load();
        })
        
        let sEmbed = new Discord.RichEmbed()
        .setColor("e8a515")
        .setTitle("Server prefix successfully changed")
        .setDescription(`New server prefix is : " ${nPrefix} "`);
        function load() {
            let query = db.collection('guilds')
            let guilds = {} // plain object, not array   
            let promise = new Promise(async function(resolve) {
            
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
                    let temp = { guilds };
                    await fs.writeFileSync ("./data/json/serversettings.json", JSON.stringify(temp), function(err) {
                        if (err) throw err;
                    
                    })
            });
          }
        
    }
}