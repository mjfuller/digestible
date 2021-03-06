//digestible node.js based server:

//approximately 1000 lines of painstakingly crafted 
//open source, self-publishing facilitating, 
//scintillating, majestic, cs132-tastic code

//IMPORTANT: SET THIS VARIABLE TO THE DOMAIN NAME! THIS IS FOR UNSUBSCRIBING
var domain = "http://digestible.io";

/* ////////////////////////////////////////////
//localhost TESTS/PRIMERS:
*//////////////////////////////////////////////
//runs a series of asserts to verify correct db functionality
var runDBTests = false; 

//populates the db with some dummy users for testing
var primeDataBase = false; 

//prints the contents of the database to the console upon initilization
var printDataBase = true; 

/* ////////////////////////////////////////////
Initialization
*//////////////////////////////////////////////

// //dependencies
var http = require('http');
 var	colors = require('colors');
 var	express = require('express');
var engines = require('consolidate');
var anyDB = require('any-db');
var mailer = require('nodemailer');
var HashMap = require('hashmap').HashMap;
var conn = anyDB.createConnection('sqlite3://digestible.db');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var scraper = require('./scraper'); //a simple scraping routine we wrote
var app = express();
var cheerio = require('cheerio');
var juice = require('juice');
var fs = require('fs');

app.engine('html', engines.hogan); // tell Express to run .html files through Hogan
app.set('views', __dirname + '/templates'); // tell Express where to find templates
app.use(express.bodyParser());
app.use(express.cookieParser('aacb87*nnai'));
app.use(express.session({secret: 'yupyupyup'}));
app.use(express.static(__dirname + '/public'));
app.use(passport.initialize());
app.use(passport.session());

// create reusable transport method (opens pool of SMTP connections)
var smtpTransport = mailer.createTransport("SMTP",{

    service: "Gmail",
    auth: {
        user: "digestableapp@gmail.com",
        pass: "javierisaboss" 
    }
});

//passport config (security/user auth)
//note: some of this code adapted from 
//https://github.com/jaredhanson/passport-local/blob/master/examples/login/app.js
passport.use('local-login', new LocalStrategy({
    usernameField : 'email',
    passwordField : 'pass',
  },
  function(email, pass, done) {
    getCreator(email, function(creator_info) { //get info from the database
       if(creator_info !== null){ //if this user exists
        if(pass === creator_info.password){ //if the password is valid
            return done(null,creator_info);
        }
        else{//invalid password
            return done(null, false, { message: 'invalid password' });
        }
       } else{
            return done(null, false, { message: 'invalid email' });
       }
    });  
  }
));

passport.serializeUser(function(creator_info, done) {
    user_email = creator_info.email;
    done(null, user_email);
});

passport.deserializeUser(function(email, done) {
    getCreator(email, function(creator_info) { //get info from the database
    if(creator_info !== null){ //if this user exists
        return done(null,creator_info);
    }
  });
});
//end of passport config

//data structure initialization
var scheduled_emails = new HashMap(); //key: email_id, value: a scheduled email

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

function sendEmail(email_id) {
    getEmail(email_id, function(email) {
       if(email !== null){

        // setup e-mail data with unicode symbols
        var mailOptions = {
            from: "Digestible" + " <" + "maximilian_fuller@brown.edu" + ">", // sender address
            to: email.recipient, // list of receivers
            subject: email.subject, // Subject line
            html: email.content // html bodies can also be sent
        };  

        // send mail with defined transport object
        smtpTransport.sendMail(mailOptions, function(error, response){
            if(error){
                console.error(error);
            }else{
                console.log("Message sent: " + response.message.cyan);
            }
        });
        updateEmailStatus(email_id, "SENT");
        scheduled_emails.remove(email_id);
       }
       else{
            console.log('null email');
        }  
    });
}

////////////////////////////////////////////////////////////////// 
//Subscribing
////////////////////////////////////////////////////////////////// 

//creates a subscription
function subscribe(collection_id, reader_email, millsToFirst, millsInterval){   
    getEntriesWithCollectionID(collection_id, function(entries) {
        if(entries !== null){
            var currentMills = millsToFirst;
            for(var i = 0; i < entries.length; i++) {
                (function(currentMills, i) {
                    var email = new Email(null, reader_email, 
                        Date.now() + currentMills, entries[i].entry_id, collection_id,
                        entries[i].subject, entries[i].content, "PENDING", entries[i].entry_number + "/" + entries.length);
                    addEmail(email, function(email_id) {
                        email.email_id = email_id;
                        //append extra html to email body
                        formatEmailBody(email, function(body) {
                            updateEmailBody(email_id, body, function() {
                                scheduleEmail(email_id, currentMills);
                            });
                        });
                    });
                })(currentMills, i);
                currentMills+=millsInterval;

            }
        }
    });
}
//appends address and unsubscribe html to the body of the email. Also adds inline css. calls callback on the result
function formatEmailBody(email, callback) {
    getCollection(email.collection_id, function(collection) {
        if(collection !== null){
            getCreator(collection.creator_email, function(creator) {
           
            var unsub = "<p id='unsub'>If you wish to unsubscribe from this collection, " + 
                "please go <a href=\"" + domain + "/unsubscribe/" + email.email_id + "\">here</a></p>";
            var address = "<p id='address'>This email was sent on behalf of " + creator.name + ", " + 
                creator.street_address + " " + creator.city + ", " + 
                creator.state + ", " + creator.zipcode + "</p>";
            var result = email.content + unsub + address;
            //inline css
            
            fs.readFile('./public/css/email.css', {encoding : "utf8"},
                function(err, css) {
                if(err) console.error(err);
                result = juice.inlineContent(result, css);
                callback(result);
            })
            });
        }
    });
}

//unsubscribes
//NOTE: NEEDS TESTING
function unsubscribe(email_id, successCallback){
    getEmail(email_id, function(email) {
        if(email == null) {
            successCallback(false);
        } else {
            //select all emails with the given collection_id and recipient
            conn.query("SELECT * FROM Emails WHERE collection_id = $1 AND recipient = $2",
            [email.collection_id, email.recipient], function(error, result) {
                if(error) {
                    console.error(error);
                    successCallback(false);
                } else {
                    if(result.rowCount == 0) {
                        successCallback(false);
                    } else {
                        for(var i = 0; i < result.rowCount; i++) {
                            //for any emails in the db scheduled to send after the
                            //cancelled email, set them to cancelled
                            if(result.rows[i].date_to_send > email.date_to_send) {
                                updateEmailStatus(result.rows[i].email_id, "CANCELLED");
                                clearTimeout(scheduled_emails.get(result.rows[i].email_id));
                                scheduled_emails.remove(result.rows[i].email_id);
                            }
                        }
                        successCallback(true);
                    }
                }
            });
        }
        
    });    
}

/* ////////////////////////////////////////////
ajax/server request handling
*///////////////////////////////////recipient///////////

//a collection of moustache templates and ajax handlers
//note: some files served statically and not represented
//by the following handlers

//debugging function to println where requests are sent to
/*app.post('*',function(req,res){
    console.log("debug post url");
    console.log(req.url);
    //console.log(Object.keys(req));//logs available req fields
});*/

//home page log in 
app.post('/log_in', function(req, res, next) {
  passport.authenticate('local-login', function(err, user, info) {
      if (err) { return next(err); }
      // Redirect if it fails
      if (!user) { return res.send(info.message); }
      req.logIn(user, function(err) {
      if (err) { return next(err); }
      // Redirect if it succeeds
      res.send('success');
    });
  })(req, res, next);
});

app.post('/log_out', function(req,res){
    req.logout();
    res.send('success');
});

//creator home (collections page)
//appends address and unsubscribe html to the body of the email. Also adds inline css. calls ca
app.get('/home', function(request, response){
    if(request.isAuthenticated()){
        getCollectionsWithCreator(request.user.email,function(collections){
            if(collections !== null){
                var moustacheParams = [];
                //create moustache field for collection names
                var collectionNamesList = [];
                for(var i = 0; i < collections.length; i++){
                    var collect = [];
                    collect.collectionTitle = collections[i].collection_title;
                    collect.collectionId = collections[i].collection_id;
                    if(collections[i].visible === "true"){
                        collect.visible = "true";
                    }
                    else{
                        collect.visible = "false";
                    }
                    collectionNamesList.push(collect);
                }

                //add the entry name fields to the moustacheParams
                moustacheParams.collectionNames = collectionNamesList;
                moustacheParams.creatorEmail = request.user.email;
                moustacheParams.creatorName = request.user.name;

                response.render('collection.html',moustacheParams);
            }
        });
    } else { //this should redirect to home page
        response.statusCode = 302;
        response.setHeader("Location", "/");
        response.end();
    }
});

app.get('/ajax/subscriptionData', function(request, response) {
    var subscriptionData = [];
    if(request.isAuthenticated()) {
        getCollectionsWithCreator(request.user.email, function(collections) {

            for(var i = 0; i < collections.length; i++) {
                (function(collections, i) {
                    var collectionData = [];
                    getEmailsWithCollectionID(collections[i].collection_id, function(emails) {
                        var subs = new HashMap(); //subscriber email addresses to arrays of emails
                        //map email addresses to corresponding emails
                        for(var j = 0; j < emails.length; j++) {
                            if(subs.has(emails[j].recipient)) {
                                subs.get(emails[j].recipient).push(emails[j]);
                            } else {
                                subs.set(emails[j].recipient, [emails[j]]);
                            }
                        }
                        var count = 0;
                        subs.forEach(function(value, key) {
                            count++;
                            //sort these emails by date
                            value.sort(function(a,b) {
                                return(a.date_to_send-b.date_to_send);
                            });
                            var progress = null;
                            var dateStarted = new Date(Math.floor(value[0].date_to_send));

                           
                            for(var j = 0; j < value.length; j++) {
                                if(value[j].status == "CANCELLED") {
                                    var prevDate = new Date(Math.floor(value[j-1].date_to_send));
                                    progress = value[j-1].entry_edition + " Ended early " + dateToString(prevDate);
                                    break;
                                } else if (value[j].status == "PENDING") {
                                    var numDays = Math.floor((value[j].date_to_send - Date.now())/86400000);
                                    progress = value[j-1].entry_edition + " Next in " + numDays + " days";
                                    break;
                                }
                                if(j == value.length-1) {
                                    progress = "Completed " + dateToString(new Date(Math.floor(value[value.length-1].date_to_send)));
                                }
                            }

                            //push a subscription item
                            collectionData.push({
                                collection_id: collections[i].collection_id,
                                collection_title: collections[i].collection_title,
                                name: "",
                                address: key,
                                date_started: dateToString(dateStarted),
                                progress: progress
                            });
                            if(subs.count() == count) {
                                subscriptionData.push(collectionData);
                                if(i == collections.length-1) {
                                    response.send({subscriptionData: subscriptionData});
                                }
                            }
                            //TEMP FIX. WORKS FOR n=1
                            //response.send({subscriptionData: subscriptionData});
                        });
                    });
                })(collections, i);
            }
            //TODO: FIX THIS. DOESN'T WORK WITH ASYNCH
            //response.send({subscriptionData: subscriptionData});
        });
    }
    
});

function dateToString(date) {
    return (date.getMonth()+1) + 
        "-" + date.getDate() + 
        "-" + date.getFullYear();
}

//ajax for populating collections page with data
app.get('/ajax/:collectionID', function(request, response) {
    getCollection(request.params.collectionID, function (collection) {
        if(collection !== null){
                    if(request.isAuthenticated() && request.user.email === collection.creator_email){
                getEntriesWithCollectionID(request.params.collectionID, function(entries) {
                    getCreator(collection.creator_email, function(creator_data) {
                        collection.creator_name = creator_data.name;
                        collection.entries = entries;
                        response.send(collection);
                    });
                });
            } else {
                response.redirect('/'); //redirect to home page
            }
        }
    });
});

//ajax for adding a collection as requested by the front end
app.post("/ajax/createCollection", function(request, response) {
    if(request.isAuthenticated()){
        var email = request.user.email;
        //default email interval is 3 days
        var collection = new Collection(null, "Name your collection", "", email, "false", 259200000);
        addCollection(collection, function(collection_id) {
            response.send(
            {
                collection_id: collection_id,
                collection_title: "Name your collection"
            });
        });
    } else {
        response.redirect('/'); //redirect to home page
    }  
});

//ajax for editing collection data from the front end
app.post('/ajax/editCollection', function(request, response) {
    getCollection(request.body.collection_id, function(collection) {
        if(collection !== null){
            if(request.isAuthenticated() && request.user.email === collection.creator_email){
                request.body.creator_email = request.user.email;
                editCollection(request.body);
                response.send(200);
            } else {
                response.redirect('/'); //redirect to home page
            }
        }
        else{
            console.log("invalid collection id- editCollection request"); //this should not occur
        }
    });    
});

//ajax for deleting collection data as requested by the front end
app.post('/ajax/deleteCollection', function(request, response) {
    getCollection(request.body.collection_id, function(collection) {
        if(collection !== null){
            if(request.isAuthenticated() && request.user.email === collection.creator_email){
                deleteCollection(request.body.collection_id);
                response.send(200);
            } else {
                response.redirect('/'); //redirect to home page
            }    
        }
    });
});

//email creation page
app.get('/:entry_id', function(request,response){
    var entry_id = request.params.entry_id;
    getEntry(entry_id, function(entry){
        if(entry != null){
            getCollection(entry.collection_id, function(collection) {
                if(request.isAuthenticated() && request.user.email === collection.creator_email){
                    entry.visible = collection.visible;
                    response.render('emailCreation.html',entry);
                } else {
                    response.redirect('/');
                }
            });
        } else {
            response.render('page_not_found.html');
        }
    });
});

//ajax for creating an entry
app.post("/ajax/createEntry", function(request, response) {
    getCollection(request.body.collection_id, function(collection) {
        if(request.isAuthenticated() && collection != null && 
            collection.creator_email == request.user.email){
            var entry = new Entry(null, request.body.collection_id, 
                request.body.entry_number, null, null, Date.now(), "new email", "");
            addEntry(entry, function(entry_id) {
                response.send({entry_id: entry_id});
            });
        } else {
            response.redirect('/'); //redirect to home page
        }
    });
});

//ajax for editing entries
app.post("/ajax/editEntry", function(request, response) {
    getEntry(request.body.entry_id, function(entry) {
        if(entry !== null) {
            getCollection(entry.collection_id, function(collection) {
                //verify that the entry belongs to the user
                if(request.isAuthenticated() && request.user.email == collection.creator_email) {
                    entry.subject = request.body.subject;
                    entry.content =request.body.content;
                    editEntry(entry);
                    response.send(200);
                } else {
                    response.redirect('/'); //redirect to home page
                }
            });
        }
    });
});

//ajax for deleting entries
app.post("/ajax/deleteEntry", function(request, response) {
    getEntry(request.body.entry_id, function(entry) {
        if(entry !== null) {
            getCollection(entry.collection_id, function(collection) {
                //verify that the entry belongs to the user
                if(request.isAuthenticated() && request.user.email == collection.creator_email) {
                    //delete the entry
                    deleteEntry(request.body.entry_id);
                    //reorder the  entry_numbers
                    getEntriesWithCollectionID(entry.collection_id, function(entries) {
                        for(var i = 0; i < entries.length; i++) {
                            if(entries[i].entry_number > entry.entry_number) {
                                entries[i].entry_number--;
                                editEntry(entries[i]);
                            }
                        }
                    });
                    response.send(200);
                } else {
                    response.redirect('/'); //redirect to home page
                }
            });
        }
    });
});

app.post("/ajax/reorderEntry", function(request, response) {
    //reorder the entry_numbers
    var start = request.body.startEntryNumber;
    var end = request.body.endEntryNumber;
    getEntriesWithCollectionID(request.body.collection_id, function(entries) {
        if(entries !== null){
            for(var i = 0; i < entries.length; i++) {
                if(entries[i].entry_number == start) {
                    entries[i].entry_number = end;
                    editEntry(entries[i]);
                } else if (start < end) {
                    if(entries[i].entry_number > start && entries[i].entry_number <= end) {
                        entries[i].entry_number--;
                        editEntry(entries[i]);
                    }
                } else {
                    if(entries[i].entry_number < start && entries[i].entry_number >= end) {
                        entries[i].entry_number++;
                        editEntry(entries[i]);
                    }   
                }
            }
        }
    });
});


//ajax for scraping
app.post("/ajax/scrapeUrl", function(req, res) { 
    if(req.isAuthenticated()){
        scraper.scrapeUrl(req.body.url, function(content){
            res.send({content: content});
        });
    }
});

//////////////////////////////////////////////
//consumer page
app.get('/consumer/:collection_id', function(request, response){
    var cl_id = request.params.collection_id;
    console.log("consumer requested collection_id: " + cl_id);

    getCollection(cl_id, function(collection) { //get info from the database
        getEntriesWithCollectionID(cl_id, function(entries){

            //check if the collection exists
            if(collection !== null && collection.visible == "true"){
                    getCreator(collection.creator_email, function(creator) {

                    var moustacheParams = {};
                    moustacheParams.collectionName = collection.collection_title;
                    moustacheParams.collectionId = cl_id;

                    var interval = collection.email_interval/86400000;
                    if(interval == 1){
                        moustacheParams.email_interval = "one per day.";
                    }
                    else {
                        moustacheParams.email_interval = "one every " + interval + " days.";
                    }

                    moustacheParams.creatorName = creator.name;
                    moustacheParams.description = collection.collection_description;
                    
                    //create moustache field for entry names
                    var entryList =  [];
                    var orderedEntries = []; //ordered db results
                    
                    //order the entries by entry_number
                    for(var i = 0; i < entries.length; i++){ 
                        orderedEntries[entries[i].entry_number-1] = entries[i];
                    }//generate the moustache fields
                    
                    for(var i = 0; i < entries.length; i++){ 

                        var entry = [];
                        if(orderedEntries[i] !== null){
                            entry.entrySubject = orderedEntries[i].subject;
                            entry.entryId = orderedEntries[i].entry_id;
                            entryList.push(entry);
                        }
                    }

                    //add the entry name fields to the moustacheParams
                    moustacheParams.entries = entryList;          
                    //render the webpage
                    response.render('consumer.html',moustacheParams);  
                }); 
            }
            else{ //render a 404 page
                //console.log("invalid collection access attempt"); //this println might come in handy for mantaining our code
                response.render('page_not_found.html',{});
            } 
        });
    });
});

//consumer page sign up requests
app.post('/consumer/sign_up', function(request, response){
    console.log("received sign_up request");

    var name = request.body.name; //format params for a subscription
    var reader_email = request.body.email;
    var collection_id = request.body.collection_id;
    var millisToFirst = 0;
    getCollection(collection_id, function(collection) {
        //only subscribe if the collection exists and is public
        if(collection != null && collection.visible == "true") {
            subscribe(collection_id, reader_email, millisToFirst, collection.email_interval);
        }
    })

    response.send("success");//on successful signup
});


//consumer page view entry requests
app.get('/consumer/e/:entry_id', function (request, response) {
    getEntry(request.params.entry_id, function(entry) {
        if(entry == null) {
            response.render("page_not_found.html");
        } else {
            response.render("entry.html",
                {
                    "content" : entry.content,
                    "subject" : entry.subject
                });
        }
    });
});

//sign up for a creator account
app.post('/sign_up', function(request, response) {
    console.log("creator " + request.body.email + " is creating an account")
    var creator = new Creator_Data(request.body.email, request.body.password, 
        request.body.name, request.body.street, request.body.city, 
        request.body.state, request.body.zip);
    getCreator(request.body.email, function(creator_data) {
        if(creator_data == null) {
            //creator email doesn't exist in the db
             addCreator(creator);

             //create a collection for them
            var coll = new Collection(null, "Name your collection", "", creator.email, "false", 259200000);
            addCollection(coll, function(id){
                response.send("success");
            });
        }
        else {
             //creator email alread exists
             response.send("Sorry, the email you gave us is already in use.");
        }
    })
});

app.post('/ajax/saveSettings', function(request, response) {
    if(request.isAuthenticated()){
        if(request.body.password == request.user.password){ //if the user is changing their password
            var creator = new Creator_Data(request.user.email, request.body.newpass, 
            request.body.name, request.body.street, request.body.city, 
            request.body.state, request.body.zip);
            editCreator(creator);
            response.send("passwordChanged");
        }
        else{
            var creator = new Creator_Data(request.user.email, request.user.password, 
            request.body.name, request.body.street, request.body.city, 
            request.body.state, request.body.zip);
            editCreator(creator);

            if(request.body.newpass !== ""){
                response.send("incorrectPass");
            }
            else{
                response.send("success");
            }
        }        
    }
    else {
        response.redirect('/'); //redirect to home page
    }
});

app.post('/ajax/loadSettings', function(request, response) {
    if(request.isAuthenticated()){
        getCreator(request.user.email, function(creator){
            response.send(creator);
        });
    }
    else {
        response.redirect('/'); //redirect to home page
    }
});

app.get('/unsubscribe/:email_id', function(request, response) {
    console.log('unscribed to email id' + request.params.email_id);
    unsubscribe(request.params.email_id, function(success) {
        if(success) {
            response.render("unsubscribe.html");
        } else {
            //TODO: Format this
            console.log('failed unsubscription attempt');
            response.render('page_not_found.html');
        }
    });
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
function Email(email_id, recipient, date_to_send, entry_id, collection_id, subject, content, status, entry_edition) {
    this.email_id = email_id;
    this.recipient = recipient;
    this.date_to_send = date_to_send;
    this.entry_id = entry_id;
    this.collection_id = collection_id;
    this.subject = subject;
    this.content = content;
    this.status = status;
    this.entry_edition = entry_edition;
}

//constructor for a Collection object
function Collection(collection_id, collection_title, collection_description, creator_email, visible, email_interval) {
    this.collection_id = collection_id;
    this.collection_title = collection_title;
    this.collection_description = collection_description;
    this.creator_email = creator_email;
    this.visible = visible ? visible : "true";
    this.email_interval = email_interval;
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
                console.error('ERROR: entry id corresponds to multiple entries')
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
    conn.query('INSERT INTO Collections (collection_id, collection_title, ' + 
        'collection_description, creator_email, visible, email_interval)' + 
        'VALUES ($1, $2, $3, $4, $5, $6)', 
        [
            id,
            collection.collection_title,
            collection.collection_description,
            collection.creator_email,
            collection.visible,
            collection.email_interval
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
                console.error('ERROR: collection id corresponds to multiple collections')
            } else {
                callback(new Collection(result.rows[0].collection_id, 
                    result.rows[0].collection_title,
                    result.rows[0].collection_description,
                    result.rows[0].creator_email, 
                    result.rows[0].visible,
                    result.rows[0].email_interval));
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
                    result.rows[i].collection_description,
                    creator_email,
                    result.rows[i].visible,
                    result.rows[i].email_interval
                ));
            }
            callback(collections);
        });
}

//updates a collection in the database
function editCollection(collection) {
    conn.query('UPDATE Collections ' + 
        'SET collection_title=$1, collection_description=$2, creator_email=$3, visible=$4, email_interval=$5 ' +
        'WHERE collection_id=$6',
    [
        collection.collection_title,
        collection.collection_description,
        collection.creator_email,
        collection.visible,
        collection.email_interval,
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
    conn.query('INSERT INTO Emails (email_id, recipient, date_to_send , entry_id , collection_id, subject, content, status, entry_edition)' + 
        'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);',
        [
            id,
            email.recipient,
            email.date_to_send,
            email.entry_id,
            email.collection_id,
            email.subject,
            email.content,
            email.status,
            email.entry_edition
        ]).on('error', console.error)
        .on('end', function() {
            console.log('email successfully added');
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
                console.error('ERROR: email id corresponds to multiple emails');
            } else if(result.rowCount == 0) {
                callback(null);
            } else {
                callback(new Email(email_id,
                    result.rows[0].recipient, 
                    result.rows[0].date_to_send, 
                    result.rows[0].entry_id, 
                    result.rows[0].collection_id,
                    result.rows[0].subject,
                    result.rows[0].content,
                    result.rows[0].status,
                    result.rows[0].entry_edition));
            }
        });
}

function getEmailsWithCollectionID(collection_id, callback) {
    conn.query('SELECT * FROM Emails WHERE collection_id=$1', [collection_id], function(error, result) {
        if(error) {
            console.error(error);
        }
        var emails = [];
        for(var i = 0; i < result.rowCount; i++) {
            emails.push(new Email(result.rows[i].email_id,
                        result.rows[i].recipient, 
                        result.rows[i].date_to_send, 
                        result.rows[i].entry_id, 
                        result.rows[i].collection_id,
                        result.rows[i].subject,
                        result.rows[i].content,
                        result.rows[i].status,
                        result.rows[i].entry_edition));
        }
        callback(emails);

    });
}


//updates an email status in the database (based on its email_id)
function updateEmailStatus(email_id, status){
    conn.query('UPDATE Emails SET status=$1 WHERE email_id=$2',
    [
        status,
        email_id
    ]).on('error', console.error);
}

//updates an email body in the database (based on its email_id)
//optional no-argument function called upon completion
//NOTE: only to be used just after email creation
function updateEmailBody(email_id, body, callback){
    conn.query('UPDATE Emails SET content=$1 WHERE email_id=$2',
    [
        body,
        email_id
    ], function(error, result) {
        if(error) {
            console.error(error);
        } else {
            if(callback) {
                callback();
            }
        }
    });
}
    

/*NOT TO BE USED
//deletes an Email
function deleteEmail(email_id){
    conn.query('DELETE FROM Emails WHERE email_id=$1', [email_id])
        .on('error', console.error);
}
*/

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
                console.error('ERROR: multiple creator ids in the database');
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

//NEEDS TESTING
//restore the scheduled emails
conn.query("SELECT * FROM Emails WHERE status=$1", ["PENDING"], function(error, result) {
    for(var i = 0; i < result.rowCount; i++) {
        var millis_until_send = result.rows[i].date_to_send - Date.now();
        millis_until_send = millis_until_send >= 0 ? millis_until_send : 0;
        scheduleEmail(result.rows[i].email_id, millis_until_send);
    }
});

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
    ++lastEmailID;
    //append a big number to the end to ensure unsubscribing is secure.
    //var random = Math.floor((Math.random() * 1000000000000000))
    return lastEmailID //* 1000000000000000 + random
}

function generateCollectionID() {
    return ++lastCollectionID;
}

function generateEntryID() {
    return ++lastEntryID;
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

function printCreators() {
    conn.query("SELECT * FROM Creator_Data", function(error, response) {
        console.log(response);
    });
}

function printDB() {
    printCollections();
    printEntries();
    printEmails();
    printCreators();
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
var c1 = new Collection(null, "boss instructions", "MY DESCRIPTION", "max@gmail.com", "true", 60000);

addCollection(c1, function(c1_id) {
    
    var e1 = new Entry(null, c1_id, 1, "max", 
        "how to be a boss", new Date(Date.now()), "hello", "be a boss.");
    var e2 = new Entry(null, c1_id, 2, "max", 
        "how to be a boss2", new Date(Date.now()), "hello", "be a boss.");
    addEntry(e1, function(e1_id) {
        addEntry(e2, function(e2_id) {
            var email1 = new Email(null, 
                "ben@gmail.com", new Date(Date.now()+60000), e1_id, c1_id, "subject", "content", "PENDING", "4/12");
            var email2 = new Email(null, 
                "javier@gmail.com", new Date(Date.now()+120000), e1_id, c1_id, "subject", "content", "PENDING", "4/12");
            addEmail(email1, function(email1_id) {
                var creator1 = new Creator_Data("spanishcurls@gmail.com", "1234", "Javier Sandoval", 
                    "1747 Legion Road", "Chapel Hill", "North Carolina", "27517")
                addCreator(creator1, function() {

                    //GET EMAILS WITH COLLECTION ID
                    getEntriesWithCollectionID(c1_id, function(entries) {
                        //console.log(entries);
                        assert(entries[0].title === "how to be a boss" && entries[1].title === "how to be a boss2");
                    });

                    //GET EMAILS WITH CREATOR
                    getEmailsWithCollectionID(c1_id, function(emails) {
-                        assert(emails[0].recipient=="ben@gmail.com");
                    });

                    //GET COLLECTIONS WITH CREATOR
                    getCollectionsWithCreator('max@gmail.com', function (collections) {
                        assert(collections[0].collection_title === "boss instructions");
                    });

                    //EMAIL ADDING/GETTING
                    getEmail(email1_id, function (email) {
                        assert(email.recipient === 'ben@gmail.com');
                    });

                    
                    updateEmailStatus(email1_id, "SENT");

                    //UPDATE EMAIL STATUS
                    getEmail(email1_id, function (email) {
                        assert(email.status === 'SENT');
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

var c1 = new Collection(null, "boss instructions", "MY DESCRIPTION", "benjamin_resnick@brown.edu", "true", 60000);
var c2 = new Collection(null, "Collection 2", "This is my awesome collection of articles", "benjamin_resnick@brown.edu", "false", 60000);

addCollection(c1, function(c1_id) {
    addCollection(c2, function(c2_id) {
        var e1 = new Entry(null, c1_id, 1, "max", 
            "how to be a boss", new Date(Date.now()), "hello", "<b>be a boss.</b>");
        var e2 = new Entry(null, c1_id, 2, "max", 
            "how to be a boss, the sql", new Date(Date.now()), "hello", "<b>be a boss TWICE");
        var e3 = new Entry(null, c1_id, 3, "max", 
            "how to be a boss", new Date(Date.now()), "hello", "<b>be a boss THRICE.</b>");
        var e4 = new Entry(null, c1_id, 4, "max", 
            "how to be a boss, the sql", new Date(Date.now()), "hello", "<b>be a boss FOUR TIMES");
        var cre1 = new Creator_Data("benjamin_resnick@brown.edu", "password", "Ben","99 walnut", "Boston", "Ohio", "12346");
        
        addEntry(e1, function(e1_id) {
            addEntry(e2, function(e2_id) {
                addEntry(e3, function(e3_id) {
                    addEntry(e4, function(e4_id) {
                        addCreator(cre1,function(c1_id){
                            console.log("database is primed");
                        });
                    });
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
app.listen(process.env.PORT || 8080, function(){
    console.log('- Server listening -'.grey);
});
