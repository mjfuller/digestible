//digestable node.js based server

//RUN TESTS/PRIMERS:

var runDBTests = false;
var primeDataBase = false;
var printDataBase = true;

//dependencies
var http = require('http');
var	colors = require('colors');
var	express = require('express');
var engines = require('consolidate');
var anyDB = require('any-db');
var mailer = require('nodemailer');
var HashMap = require('hashmap').HashMap;
var conn = anyDB.createConnection('sqlite3://digestible.db');
var app = express();

app.engine('html', engines.hogan); // tell Express to run .html files through Hogan
app.set('views', __dirname + '/templates'); // tell Express where to find templates
app.use(express.bodyParser());
app.use(express.static(__dirname + '/public'));

// create reusable transport method (opens pool of SMTP connections)
//NOTE: we may want to use a different transport method
var smtpTransport = mailer.createTransport("SMTP",{

    service: "Gmail",
    auth: {
        user: "benjamin_resnick@brown.edu",
        pass: "cindy301" //now don't go doin mischevious things with my password y'all
    }
});


//data structure initializations 
var scheduled_emails = new HashMap(); //key: email_id, value: a scheduled email



/* ////////////////////////////////////////////
End of initialization
*//////////////////////////////////////////////

/* ////////////////////////////////////////////
Email Scheduling
*//////////////////////////////////////////////

function scheduleEmail(email_id, millisFromNow) {
    console.log("email with id " + email_id + " scheduled for " + millisFromNow + " milliseconds from now");
    var job = setTimeout(function() {
        sendEmail(email_id);
    },millisFromNow);

    scheduled_emails.set(email_id,job);
}

/*
*
* sample params:
senderName = "Fred Foo";
senderEmail = "benjamin_resnick@brown.edu";
receiver = "benjamin_resnick@brown.edu, neb301@yahoo.com";
subject = "Hello";
bodymaximilian_fuller@brown.edu = "Hello world";
var dateToEmail = new Date(2014, 3, 19, 14, 26 ,0,0); //year, month, day, hour, minute, second, millis
scheduleEmail(senderName,senderEmail,receiver,subject,body,dateToEmail);
*
*/
function sendEmail(email_id) {
    console.log("sending email with id: " + email_id);
    getEmail(email_id, function(email) {
        getCollection(email.collection_id, function (collection) {
            getEntry(email.entry_id, function (entry) {

            	// setup e-mail data with unicode symbols
            	var mailOptions = {
            	    from: "John Doe" + " <" + "maximilian_fuller@brown.edu" + ">", // sender address
            	    to: email.recipient, // list of receivers
            	    subject: entry.subject, // Subject line
            	    //text: contents // plaintext body

            	    //remember to add comma if using html field
            	    html: entry.content // html bodies can also be sent
            	};	

                // send mail with defined transport object
                smtpTransport.sendMail(mailOptions, function(error, response){
                    if(error){
                        console.log(error);
                    }else{
                        console.log("Message sent: " + response.message.cyan);
                    }
                });
                deleteEmail(email);
                scheduled_emails.remove(email_id);
            });
        });
    });
}

////////////////////////////////////////////////////////////////// 
//Subscribing
////////////////////////////////////////////////////////////////// 

//creates a subscription
function subscribe(collection_id, reader_email, millsToFirst, millsInterval){   
    getEntriesWithCollectionID(collection_id, function(entries) {
        var currentMills = millsToFirst;
        for(var i = 0; i < entries.length; i++) {
            var email = new Email(null, reader_email, 
                Date.now() + currentMills, entries[i].entry_id, collection_id);
            //console.log("currentMills=" + currentMills + "(function)");
            (function(currentMills) {
                addEmail(email, function(email_id) {
                    //console.log("currentMills=" + currentMills + "(callback)");
                    scheduleEmail(email_id, currentMills);
                });
            })(currentMills);
            currentMills+=millsInterval;

        }
    });
    

}

//unsubscribes
function unsubscribe(collection_id, reader_email){
    
}

/* ////////////////////////////////////////////
email testing
*//////////////////////////////////////////////
/*if(runEmailTests) {
var c1 = new Collection(null, "boss instructions", "benjamin_resnick@brown.edu");
addCollection(c1, function(c1_id) {
    
    var e1 = new Entry(null, c1_id, 1, "max", 
        "how to be a boss", new Date(Date.now()), "hello", "<b>be a boss.</b>");
    addEntry(e1, function(e1_id) {
        var email1 = new Email(null, 
            "benjamin_resnick@brown.edu", new Date(Date.now()+60000), e1_id, c1_id);
        addEmail(email1, function(email1_id) {
            sendEmail(email1_id);

            deleteEmail(email1_id);
            deleteEntry(e1_id);
            deleteCollection(c1_id);
        });
    });
});
}*/




/* ////////////////////////////////////////////
ajax/server request handling
*//////////////////////////////////////////////

//consumer page handling
app.post('/consumer/sign_up', function(request, response){
    console.log("received sign_up request");

    var name = request.body.name; //format params for a subscription
    var reader_email = request.body.email;
    var collection_id = request.body.collection_id;
    var millisToFirst = 0;
    var millisInterval = 60000; //1 min
    subscribe(collection_id, reader_email, millisToFirst, millisInterval);

    response.send("success");//on successful signup
});


app.get('/consumer/:collection_id', function(request, response){
    var cl_id = request.params.collection_id;
    console.log("consumer requested collection_id: " + cl_id);

    //start storing relevant moustache params
    var moustacheParams = [];
    //moustacheParams.push({collectionName: cl_id});
    moustacheParams.collectionName = cl_id;
    /*(function(currentMills) {
                addEmail(email, function(email_id) {
                    //console.log("currentMills=" + currentMills + "(callback)");
                    scheduleEmail(email_id, currentMills);
                });
    })(currentMills);
*/

    getCollection(cl_id, function(collection) {
        getEntriesWithCollectionID(cl_id, function(entries){
            //check if the collection exists
            if(collection !== null){
                
                //create moustache field for entry names
                var entryList =  [];
                var orderedEntries = []; //ordered db results
                
                console.log(entries[0].title);
                //order the entries by entry_number
                for(var i = 0; i < entries.length; i++){ 
                    orderedEntries[entries[i].entry_number-1] = entries[i];
                }//generate the moustache fields
                for(var i = 0; i < entries.length; i++){ 
                    var entry = [];
                    entry.entryTitle = orderedEntries[i].title;
                    entry.entryId = orderedEntries[i].entry_id;
                    entryList.push(entry);
                }

                //add the entry name fields to the moustacheParams
                moustacheParams.entries = entryList;
                console.log(moustacheParams);
          
                //render the webpage
                response.render('consumer.html',moustacheParams);    
            }
            else{ //render a 404 page
                console.log("invalid collection access attempt");
                response.render('page_not_found.html',{});
            } 
        });
    });
  
});

app.get('/consumer/:collection_id/:entry_id', function (request, response) {
    getEntry(request.params.entry_id, function(entry) {
        if(entry == null) {
            response.render("page_not_found.html");
        } else {
            response.render("entry.html",
                {
                    "content" : entry.content,
                });
        }
    });
});


app.get('/suscriber/login', function(request, response) {
    //TODO
});





/* ////////////////////////////////////////////
Database wrappers
*//////////////////////////////////////////////


//constructor for a new Entry object
//eg var entry = new Entry(blah, blah, blah)
function Entry(entry_id, collection_id, entry_number, author, title, date_submitted, subject, content) {
    this.entry_id = entry_id;
    this.collection_id = collection_id;
    this.entry_number = entry_number;
    this.author = author;
    this.title = title;
    this.date_submitted = date_submitted;
    this.subject = subject;
    this.content = content;
}

//constructor for an Email object
function Email(email_id, recipient, date_to_send, entry_id, collection_id) {
    this.email_id = email_id;
    this.recipient = recipient;
    this.date_to_send = date_to_send;
    this.entry_id = entry_id;
    this.collection_id = collection_id;
}

//constructor for a Collection object
function Collection(collection_id, collection_title, creator_email) {
    this.collection_id = collection_id;
    this.collection_title = collection_title;
    this.creator_email = creator_email;
}


function Creator_Data(email, password, name, street_address, city, state, zipcode) {
    this.email = email;
    this.password = password;
    this.name = name;
    this.street_address = street_address;
    this.city = city;
    this.state = state;
    this.zipcode = zipcode;
}

//puts an entry into the database and calls callback on the entry id
function addEntry(entry, callback){
    var id = generateEntryID();
    conn.query('INSERT INTO Entries (entry_id, collection_id, entry_number, author, title, '+
        'date_submitted, subject, content)' + 
        'VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', 
        [
            id,
            entry.collection_id,
            entry.entry_number,
            entry.author, 
            entry.title,
            entry.date_submitted,
            entry.subject,
            entry.content
        ]).on('error', console.error).on('end', function() {
             callback(id);
        });
   

}

//gets the entry with the given entry_id then calls callback on the resulting entry
//this entry is null if no entry could be found
function getEntry(entry_id, callback) {
    conn.query('SELECT * FROM Entries WHERE entry_id=$1', [entry_id],
        function(error, result) {
            if(error)
                console.error;
            if(result.rowCount === 0) {
                callback(null);
            }
            else if(result.rowCount >= 2) {
                console.log('ERROR: entry id corresponds to multiple entries')
            } else {
                callback(new Entry(
                    entry_id,
                    result.rows[0].collection_id,
                    result.rows[0].entry_number,
                    result.rows[0].author,
                    result.rows[0].title,
                    result.rows[0].date_submitted,
                    result.rows[0].subject,
                    result.rows[0].content
                ));
            }


        });
}

//calls callback on an array of all the entries in a given collection
function getEntriesWithCollectionID(collection_id, callback) {
    conn.query('SELECT * FROM Entries WHERE collection_id=$1', [collection_id],
        function(error, result) {
            if(error)
                console.error;
            var entries = [];
            for(var i = 0; i < result.rowCount; i++) {
                entries.push(new Entry(
                    result.rows[i].entry_id,
                    collection_id,
                    result.rows[i].entry_number,
                    result.rows[i].author,
                    result.rows[i].title,
                    result.rows[i].date_submitted,
                    result.rows[i].subject,
                    result.rows[i].content
                ));
            }
            callback(entries);
        });
}


//updates an entry in the database (based on its entry id)
function editEntry(entry){
    conn.query('UPDATE Entries SET collection_id=$1, entry_number=$2, author=$3, title=$4, date_submitted=$5, subject=$6, content=$7 WHERE entry_id=$8;',
        [
            entry.collection_id,
            entry.entry_number,
            entry.author, 
            entry.title,
            entry.date_submitted,
            entry.subject,
            entry.content,
            entry.entry_id
        ]).on('error', console.error);
}


//deletes an entry
function deleteEntry(entry_id){
    conn.query('DELETE FROM Entries WHERE entry_id=$1', [entry_id])
        .on('error', console.error);
    //TODO: update emails
}


//puts a collection into the database and calls callback on its id
function addCollection(collection, callback){
    var id = generateCollectionID();
    conn.query('INSERT INTO Collections (collection_id, collection_title, creator_email)' + 
        'VALUES ($1, $2, $3)', 
        [
            id,
            collection.collection_title,
            collection.creator_email,
        ]).on('error', console.error).on('end', function() {
            callback(id);
        });
    


}


//gets the collection with the given collection id. And calls 
//callback on the resulting collection
function getCollection(collection_id, callback) {
    conn.query('SELECT * FROM Collections ' + 
        'WHERE collection_id=$1',
        [collection_id],
        function(error, result) {
            if(error)
                console.error;
            if(result.rowCount == 0) {
                callback(null);
            } else if(result.rowCount >= 2) {
                console.log('ERROR: collection id corresponds to multiple collections')
            } else {
                callback(new Collection(result.rows[0].collection_id, 
                    result.rows[0].collection_title, result.rows[0].creator_email));
            }
        });
}

//calls callback on an array of all the collections under a given creator_email
function getCollectionsWithCreator(creator_email, callback) {
    conn.query('SELECT * FROM Collections WHERE creator_email=$1', [creator_email],
        function(error, result) {
            var collections = [];
            for(var i = 0; i < result.rowCount; i++) {
                collections.push(new Collection(
                    result.rows[i].collection_id,
                    result.rows[i].collection_title,
                    creator_email
                ));
            }
            callback(collections);
        });
}

//updates a collection in the database
function editCollection(collection) {
    conn.query('UPDATE Collections ' + 
        'SET collection_title=$1, creator_email=$2 ' +
        'WHERE collection_id=$3',
    [
        collection.collection_title,
        collection.creator_email,
        collection.collection_id
    ]).on('error', console.error);
}

//deletes a collection in the database
function deleteCollection(collection_id) {
    conn.query('DELETE FROM Collections WHERE collection_id=$1',
        [collection_id])
        .on('error', console.error);
}

//puts an email into the database and calls callback on its id
function addEmail(email, callback) {
    var id = generateEmailID();
    conn.query('INSERT INTO Emails (email_id, recipient, date_to_send , entry_id , collection_id)' + 
        'VALUES ($1, $2, $3, $4, $5);',
        [
            id,
            email.recipient,
            email.date_to_send,
            email.entry_id,
            email.collection_id
        ]).on('error', console.error)
        .on('end', function() {
            callback(id);
        });
}

//calls callback on the the email with the given email id (could be null if none
// exist with the given email_id)
function getEmail(email_id, callback) {
    conn.query('SELECT * FROM Emails WHERE email_id = $1', [email_id],
        function(error, result) {
            if(error) {
                console.error(error);
            }
            if(result.rowCount >= 2) {
                console.log('ERROR: email id corresponds to multiple emails');
            } else if(result.rowCount == 0) {
                callback(null);
            } else {
                callback(new Email(email_id,
                    result.rows[0].recipient, 
                    result.rows[0].date_to_send, 
                    result.rows[0].entry_id, 
                    result.rows[0].collection_id));
            }
        });
}

/* NOT TO BE USED
//updates an email in the database (based on its email_id)
function editEmail(email){
    conn.query('UPDATE Emails ' + 
        'SET recipient=$2, date_to_send=$3, entry_id=$4, collection_id=$5' +
        'WHERE email_id=$1',
    [
        email.email_id,
        email.recipient,
        email.date_to_send,
        email.entry_id,
        email.collection_id
    ]).on('error', console.error);
    }
    */


//deletes an Email
function deleteEmail(email_id){
    conn.query('DELETE FROM Emails WHERE email_id=$1', [email_id])
        .on('error', console.error);
}

//adds a creator to the database. Optional function callback (which takes no arguments) fires
//upon completion
function addCreator(creator_data, callback) {
    conn.query('INSERT INTO Creator_Data (email, password, name, ' + 
        'street_address, city, state, zipcode) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [
        creator_data.email,
        creator_data.password,
        creator_data.name,
        creator_data.street_address,
        creator_data.city,
        creator_data.state,
        creator_data.zipcode
    ], function(error, result) {
        if(error) console.error(error);
        else {
            if(callback != null) {
                callback();
            }
        }
    });
}

//call callback on the creator_data object given the creator_email
function getCreator(creator_email, callback) {
    conn.query("SELECT * FROM Creator_Data WHERE email=$1", [creator_email],
        function(error, result) {
            if(error) {
                console.error(error);
            } else if(result.rowCount>=2) {
                console.log('ERROR: multiple creator ids in the database');
            } else if(result.rowCount==0){
                callback(null);
            } else {
                callback(new Creator_Data(
                    creator_email,
                    result.rows[0].password,
                    result.rows[0].name,
                    result.rows[0].street_address,
                    result.rows[0].city,
                    result.rows[0].state,
                    result.rows[0].zipcode
                    ));
            }
        });
}

//updates the creator_data with email equal to creator_data.email, does nothing 
function editCreator(creator_data) {
    conn.query('UPDATE Creator_Data SET password=$1, name=$2, street_address=$3, '
         + 'city=$4, state=$5, zipcode=$6 WHERE email=$7',
         [
            creator_data.password,
            creator_data.name,
            creator_data.street_address,
            creator_data.city,
            creator_data.state,
            creator_data.zipcode,
            creator_data.email
         ]).on('error', console.error);
}

//deletes the creator_data with the given creator_email
function deleteCreator(creator_email) {
    conn.query('DELETE FROM Creator_Data WHERE email=$1', [creator_email])
        .on('error', console.error);
}





//define and prime the unique identifiers for each table
var lastEmailID;
var lastCollectionID;
var lastEntryID;

conn.query("SELECT MAX(email_id) FROM Emails", function(error, result) {
    if(error) {
        console.error(error);
    } else  {
        lastEmailID = result.rows[0]['MAX(email_id)'];
    }
});

conn.query("SELECT MAX(collection_id) FROM Collections", function(error, result) {
    if(error) {
        console.error(error);
    } else  {
        lastCollectionID = result.rows[0]['MAX(collection_id)'];
    }
});

conn.query("SELECT MAX(entry_id) FROM Entries", function(error, result) {
    if(error) {
        console.error(error);
    } else  {
        lastEntryID = result.rows[0]['MAX(entry_id)'];
    }
});

function generateEmailID() {
    return ++lastEmailID;
}

function generateCollectionID() {
    return ++lastCollectionID;
}

function generateEntryID() {
    return ++lastEmailID;
}

//printing for debugging
function printEmails() {
    conn.query("SELECT * FROM Emails", function(error, response) {
        console.log(response);
    });
}

function printEntries() {
    conn.query("SELECT * FROM Entries", function(error, response) {
        console.log(response);
    });
}
function printCollections() {
    conn.query("SELECT * FROM Collections", function(error, response) {
        console.log(response);
    });
}

function printDB() {
    printCollections();
    printEntries();
    printEmails();
}



//////////////////////////////////////////////
//test cases for DB wrappers
//NOTE: must be run with a freshly loaded DB
//////////////////////////////////////////////
function assert(cond) {
    if(!cond) {
        console.log("assertion failed");
    } else {
        console.log("assertion passed");
    }
}

if(runDBTests) {
setTimeout(function() {
var c1 = new Collection(null, "boss instructions", "max@gmail.com");

addCollection(c1, function(c1_id) {
    
    var e1 = new Entry(null, c1_id, 1, "max", 
        "how to be a boss", new Date(Date.now()), "hello", "be a boss.");
    var e2 = new Entry(null, c1_id, 2, "max", 
        "how to be a boss2", new Date(Date.now()), "hello", "be a boss.");
    addEntry(e1, function(e1_id) {
        addEntry(e2, function(e2_id) {
            var email1 = new Email(null, 
                "ben@gmail.com", new Date(Date.now()+60000), e1_id, c1_id);
            var email2 = new Email(null, 
                "javier@gmail.com", new Date(Date.now()+120000), e1_id, c1_id);
            addEmail(email1, function(email1_id) {
                var creator1 = new Creator_Data("spanishcurls@gmail.com", "1234", "Javier Sandoval", 
                    "1747 Legion Road", "Chapel Hill", "North Carolina", "27517")
                addCreator(creator1, function() {

                    //GET EMAILS WITH COLLECTION ID
                    getEntriesWithCollectionID(c1_id, function(entries) {
                        //console.log(entries);
                        assert(entries[0].title === "how to be a boss" && entries[1].title === "how to be a boss2");
                    });

                    //GET COLLECTIONS WITH CREATOR
                    getCollectionsWithCreator('max@gmail.com', function (collections) {
                        assert(collections[0].collection_title === "boss instructions");
                    });

                    //EMAIL ADDING/GETTING
                    getEmail(email1_id, function (email) {
                        assert(email.recipient === 'ben@gmail.com');
                    });

                    deleteEmail(email1_id);

                    //EMAIL DELETING
                    getEmail(email1_id, function (email) {
                        assert(email == null);
                    });

                    //ENTRY ADDING/GETTING
                    getEntry(e1_id, function(entry) {
                        assert(entry.author === "max");
                    });
                    
                    e1.entry_id = e1_id;
                    e1.author = "pete";
                    editEntry(e1);

                    //ENTRY EDITING
                    getEntry(e1_id, function(entry) {
                        assert(entry.author === "pete");
                    });
                    
                    deleteEntry(e1_id);
                    deleteEntry(e2_id);

                    //ENTRY DELETION
                    getEntry(e1_id, function(entry) {
                        assert(entry == null);
                    });

                    //COLLECTION ADDING/GETTING
                    getCollection(c1_id, function(collection) {
                        assert(collection.collection_title === "boss instructions");
                    });
                    
                    c1.collection_id = c1_id;
                    c1.collection_title = "new boss instructions";
                    editCollection(c1);

                    //COLLECTION EDITING
                    getCollection(c1_id, function(collection) {
                        assert(collection.collection_title === "new boss instructions");
                    });

                    deleteCollection(c1_id);

                    //COLLECTION DELETION
                    getCollection(c1_id, function(collection) {
                        assert(collection == null);
                    });

                    //CREATOR_DATA ADDING/GETTING
                    getCreator(creator1.email, function(creator) {
                        assert(creator.zipcode === "27517");
                    });

                    creator1.password = "4321";
                    editCreator(creator1);

                    //CREATOR_DATA EDITING
                    getCreator(creator1.email, function(creator) {
                        assert(creator.password === "4321");
                    });

                    deleteCreator(creator1.email);

                    //CREATOR_DATA DELETION
                    getCreator(creator1.email, function(creator) {
                        assert(creator == null);
                    });
                });
            });
        });
        
    });
});
}, 500);
}

///////////////////////////////////////
//Prime Database
///////////////////////////////

if(primeDataBase) {
//wait to avoid collision with table id primers
setTimeout(function() {
var c1 = new Collection(null, "boss instructions", "benjamin_resnick@brown.edu");
addCollection(c1, function(c1_id) {
    
    var e1 = new Entry(null, c1_id, 1, "max", 
        "how to be a boss", new Date(Date.now()), "hello", "<b>be a boss.</b>");
    var e2 = new Entry(null, c1_id, 2, "max", 
        "how to be a boss, the sql", new Date(Date.now()), "hello", "<b>be a boss TWICE");
    var e3 = new Entry(null, c1_id, 3, "max", 
        "how to be a boss", new Date(Date.now()), "hello", "<b>be a boss THRICE.</b>");
    var e4 = new Entry(null, c1_id, 4, "max", 
        "how to be a boss, the sql", new Date(Date.now()), "hello", "<b>be a boss FOUR TIMES");
    addEntry(e1, function(e1_id) {
        addEntry(e2, function(e2_id) {
            addEntry(e3, function(e3_id) {
                addEntry(e4, function(e4_id) {
                    console.log("database is primed");
                });
            });
        });
    });
});
}, 500);
}

if(printDataBase) {
    printDB();
}



////////////////////////////////////////////////////////////////// 
//run on local for testing
////////////////////////////////////////////////////////////////// 
app.listen(8080, function(){
    console.log('- Server listening on port 8080'.grey);
});
