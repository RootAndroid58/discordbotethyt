const {
	letterTrans
} = require('custom-translate');
const dictionary = require('../assets/json/dvorak');

exports.run = async (client, message, args) => {
	let text = args.join(" ")
	if (!text) return message.channel.send(`What text would you like to convert to Dvorak encoding?`)

	return message.channel.send(letterTrans(text, dictionary));
}

exports.conf = {
	enabled: true,
	guildOnly: false,
	aliases: [],
	permLevel: "User"
};

exports.help = {
	name: 'dvorak',
	description: 'Converts text to Dvorak encoding.',
	category: "text-edit",
	usage: "dvorak <text>",
};