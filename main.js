const TelegramBotApi = require("node-telegram-bot-api");
const telegramToken = "1518968798:AAGGK5H7b2DZFBkUWzc0bEx1NiRLNCaeiOo";
const telegramBot = new TelegramBotApi(telegramToken, { polling: true });
const easyvk = require("easyvk");
const vkToken = "59993d6f788dae04c16b82b7bcd3eeb857ba8e60036d140871dc3f02c1cadcc65958e9675cd022bea03e6";
let vkBot = null;
const fs = require("fs");
const paths = require("path");
const lineReader = require("line-reader");

const wordRelations = {};
const previousTelegramMessages = {}
const previousVKMessages = {}

const activationPhrases = ["ахах", "ахап", "рофл", "))", "ору", "юмор", "смешно", "орирую", "f[f[f"];
const settings = {
    minOriginalPart: 0.5,
    randomFactor: 0.3,
    maxJokeLenth: 30,
    ignoreJokesShorterThan: 2
}

function loadRelations() {
    fs.readdirSync(paths.join(process.cwd(), "learningbase")).forEach(function (fileName) {
        let path = paths.join(process.cwd(), "learningbase", fileName);
        console.log("Loading file: ", path);
        lineReader.eachLine(path, { encoding: 'utf8' }, function (line, lastLine) {
            let phrases = line.split(new RegExp('[,?!"().;\n]', 'g'));
            for (let phrase of phrases) {
                phrase = phrase.trim();
                if (!phrase) continue;
                let words = phrase.split(" ");
                let previousWord = null;
                words.forEach(function (word, i) {
                    word = word.trim().toLowerCase();
                    if (!word) return;
                    if (!wordRelations[word]) wordRelations[word] = {
                        text: word,
                        count: 1,
                        usedAsBegining: (i == 0) ? 1 : 0,
                        usedAsEnding: (i == words.length - 1) ? 1 : 0,
                        relations: {},
                        totalRelationsUsed: 0
                    }
                    else {
                        if (i == 0) wordRelations[word].usedAsBegining++;
                        if (i == words.length - 1) wordRelations[word].usedAsEnding++;
                        wordRelations[word].count++;
                    }
                    if (previousWord) {
                        if (!previousWord.relations[word]) previousWord.relations[word] = {
                            count: 1,
                            reference: wordRelations[word]
                        }
                        else {
                            previousWord.relations[word].count++;
                        }
                        previousWord.totalRelationsUsed++;
                    }
                    previousWord = wordRelations[word];
                })
            }
        });
    });
}

loadRelations();

function makeJoke(phrase) {
    console.log("Makejoke", phrase);
    let words = phrase.split(" ");
    if (words.length <= settings.ignoreJokesShorterThan) return false;
    let minOriginalPart = Math.round(words.length * settings.minOriginalPart);
    while (words.length >= minOriginalPart) {
        let word = words.pop();
        let relations = (wordRelations[word]) ? Object.keys(wordRelations[word].relations) : [];
        if (relations.length == 0) continue;
        let joke = [word];
        while (true) {
            let variants = [];
            relations.forEach((relation) => {
                if (joke.indexOf(relation) === -1) variants.push({
                    word: relation,
                    weight: (wordRelations[word].relations[relation].count / wordRelations[word].totalRelationsUsed) + (Math.random() * settings.randomFactor),
                    endingFactor: (wordRelations[relation].usedAsEnding / wordRelations[relation].count)
                })
            });
            if (variants.length == 0) return words.join(" ") + " " + joke.join(" ");
            variants.sort((a, b) => {
                return a.weight - b.weight;
            });
            let picked = variants[0];
            joke.push(picked.word)
            let itsTimeToStop = (picked.endingFactor > 0) ? ((picked.endingFactor + ((joke.length - 1) / settings.maxJokeLenth)) > Math.random()) : false;
            if (relations.length == 0) itsTimeToStop = true;
            if (itsTimeToStop) return words.join(" ") + " " + joke.join(" ");
            else {
                relations = (wordRelations[picked.word]) ? Object.keys(wordRelations[picked.word].relations) : [];
                word = picked.word;
            }
        }
    }
    return false;
}

function respondTelegram(msg) {
    if (!previousTelegramMessages[msg.chat.id]) return false;
    let jokeText = previousTelegramMessages[msg.chat.id].text.toLowerCase();
    let phrases = jokeText.split(new RegExp('[,?!"().;\n]', 'g'));
    let joke = false;
    while ((!joke) && (phrases.length > 0)) {
        joke = makeJoke(phrases.pop());
    }
    console.log("joke", joke);
    if (joke) setTimeout(() => {
        telegramBot.sendMessage(msg.chat.id, joke);
    }, 800);
    return !!joke;
}

telegramBot.on("message", (msg) => {
    console.log("telegram", msg);
    let messageText = msg.text.toLowerCase();
    let activated = false;
    for (phrase of activationPhrases) {
        if (messageText.indexOf(phrase) !== -1) {
            activated = respondTelegram(msg);
            break;
        }
    }
    if (!activated) previousTelegramMessages[msg.chat.id] = msg;
});

function respondVK(msg) {
    if (!previousVKMessages[msg.peer_id]) return false;
    let jokeText = previousVKMessages[msg.peer_id].text.toLowerCase();
    let phrases = jokeText.split(new RegExp('[,?!"().;\n]', 'g'));
    let joke = false;
    while ((!joke) && (phrases.length > 0)) {
        joke = makeJoke(phrases.pop());
    }
    console.log("joke", joke);
    if (joke) setTimeout(() => {
        vkBot.call("messages.send", {
            random_id: Math.random()*1000000000,
            peer_id: msg.peer_id,
            message: joke
        });
    }, 800)
    return !!joke;
}

easyvk({
    access_token: vkToken
}).then(vk => {
    vkBot = vk;
    function reconnect() {
        vk.bots.longpoll.connect({
            forGetLongPollServer: {},
            forLongPollServer: {}
        }).then(( connection ) => {
            connection.on("message_new", (event) => {
                let message = event.message;
                console.log("vk", message);
                let messageText = message.text.toLowerCase();
                let activated = false;
                for (phrase of activationPhrases) {
                    if (messageText.indexOf(phrase) !== -1) {
                        activated = respondVK(message);
                        break;
                    }
                }
                if (!activated) previousVKMessages[message.peer_id] = message;
            });
            connection.on('error', function (event) {
                console.error(event);
                connection.close();
                reconnect();
            });
            connection.on('failure', function (event) {
                console.error(event);
                connection.close();
                reconnect();
            });
            connection.on('reconnectError', function (event) {
                console.error(event);
                connection.close();
                reconnect();
            })
        })
    }
    reconnect();
})