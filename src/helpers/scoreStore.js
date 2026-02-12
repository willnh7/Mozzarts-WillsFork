const userScores = new Map ([
    ["exampleplayer", 10]
]);

// Gets the given user's score
function getScore(username) {
    if(!userScores.has(username)){ // If user not in map, return default value
        return -1;
    }
    return userScores.get(username);
}

// Adds the given amount to the given user's score
function addScore(username, amount) {
    if(!userScores.has(username)){ // If user not in map, add them to it
        userScores.set(username, amount);
        return;
    }
    userScores.set(username, userScores.get(username) + amount);
}

module.exports = {
    getScore,
    addScore
};
