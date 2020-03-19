const express = require('express')
const session = require('express-session')
const bodyParser = require('body-parser')
const cors = require('cors')
const TWO_HOURS = 1000 * 60 * 60 * 2

const app = express(); 
let pg = require("pg");			//postgres

app.use(cors());

global.users = []			//holds user information from database and newly created users

global.savingsAccountNumber = 100000;	//savingsAccountNumber starts at 100000 and is incremented each time an account of this type is opened
global.checkingAccountNumber = 500000;	//checkingAccountNumber starts at 500000 and is incremented each time an account of this type is opened


let connectionString = {		//connect to db
    host: 'ec2-54-221-243-211.compute-1.amazonaws.com',
    port: 5432,
    user: 'xmfxzigqqctouo',
    password: 'c32fb92ec8652dd3837ed8423fa1eef3938b939ddb06235b19150f883871a087',
		database: 'dbds5lgqf1gspn',
		ssl:true
}

let pool = new pg.Pool(connectionString);

pool.connect(function(err, client, done) {

    const query = client.query(new pg.Query("SELECT * from customer_info"))
    
    query.on('error', (res) => {	//error
        console.log(res);
    })
    query.on('row', (row) => {	//push data from database to data structure
	 global.users.push(row);
    })


    done()
})




const{
	PORT = process.env.PORT || 8080,
	NODE_ENV = 'development',
	SESS_NAME = 'sid',
	SESS_SECRET = 'ssh!quiet,it\'asecret!',
	SESS_LIFETIME = TWO_HOURS

}  = process.env

const IN_PROD = NODE_ENV === 'production'



app.use(bodyParser.json());

app.use(bodyParser.urlencoded({
	extended:true
}))


app.post('/api/validateUser', (req, res) => {			//api for validating user when signing in

	console.log('validateLogin called');

	const{email, password, customer} = req.body;

	if(email && password){
		const user = global.users.find(user => user.email.toLowerCase() === email.toLowerCase() && user.password === password);
		
		const specificTransaction = []		//holds user information from database and newly created users

		if(user){

			let val = 'Valid Login' + user.customer; //1 represents customer, 0 represents manager

			if(user.customer === 1){	//if a customer, get only this customer's transactions

				const accountArray = []		//holds savings and checking account info for user
				pool.connect(function(err, client, done) {		//checking and savings balance and account numbers get
					    const query = client.query(new pg.Query("SELECT * from bank_accounts where email=$1", [user.email]))

					    query.on('row', (row) => {	//push transaction of user from database to data structure
						    accountArray.push(row);
					    })
					    query.on('error', (res) => {	//error
						console.log(res);
					    })
					   query.on("end", function (result) {
						res.json({value:val, transactions:specificTransaction, first_name: user.first_name, last_name: user.last_name, email: user.email, address: user.address, zipcode: user.zipcode, accountInfo: accountArray});
					    });

					    done()
				})
				
			
			}else{		//if bank manager, then give list of all transactions of all customers
				
				var s = []
				pool.connect(function(err, client, done) {
					    const query = client.query(new pg.Query("SELECT * from transactions"))


					    query.on('row', (row) => {	//push transaction of user from database to data structure
						    s.push(row);
					    })
					    query.on('error', (res) => {	//error
						console.log(res);
					    })
					   query.on("end", function (result) {
						res.json({value:val, transactions:s, first_name: user.first_name, last_name: user.last_name, email: user.email, address: user.address, zipcode: user.zipcode});
						   console.log(s); 
					   });

					    done()
				})
			}
		}else{
			res.json({value: 'Invalid Username and/or Password'});
		}
	}else{
			res.json({value: 'Invalid Username and/or Password'});
	}
});


app.post('/api/registerUser', (req, res) => {				//api for user registration
	
	console.log('registering user');
	const {first_name, last_name, email, password, confirmPassword, customer, address, zipcode} = req.body
	
	if(password != confirmPassword){
		res.send("Passwords do not match");	
	}
	
	var dateObj = new Date();
	var month = dateObj.getUTCMonth() + 1; //months from 1-12
	var day = dateObj.getUTCDate();
	var year = dateObj.getUTCFullYear();

	var dateHold = year + "-" + month + "-" + day;

	if(email && password){
		var exists = global.users.some(user => user.email.toLowerCase() === email.toLowerCase())
	
		if(!exists){			//if no user exists in db, create that user
			const user = {
				first_name,
				last_name, 
				email,
				password,
				customer,
				address,
				zipcode
			}

			global.users.push(user)

			pool.query('INSERT INTO customer_info (password, last_name, first_name, email, customer, address, zipcode) VALUES ($1, $2, $3, $4, $5, $6, $7)', [user.password, user.last_name, user.first_name, user.email.toLowerCase(), user.customer, user.address, user.zipcode], (error, results) => {
			    if (error) {
			      throw error
			    }
			  })
// 			pool.query('INSERT INTO transactions (transaction_id, email, date_stamp, amount, balance, first_name, last_name) VALUES (DEFAULT, $1, $2, $3, $4, $5, $6)', [user.email.toLowerCase(), dateHold, 0, 0, user.first_name, user.last_name], (error, results) => {
// 			    if (error) {
// 			      throw error
// 			    }
// 			  })
			
			
			pool.query('INSERT INTO bank_accounts (first_name, last_name, email, account_number, status, balance, type, zipcode) VALUES ($1, $2, $3, DEFAULT, $4, $5, $6, $7)', [user.first_name, user.last_name, user.email, 'Closed', 0 ,'savings', user.zipcode], (error, results) => {
			    if (error) {
			      throw error
			    }
			})

			pool.query('INSERT INTO bank_accounts (first_name, last_name, email, account_number, status, balance, type, zipcode) VALUES ($1, $2, $3, DEFAULT, $4, $5, $6, $7)', [user.first_name, user.last_name, user.email, 'Closed', 0 ,'checking', user.zipcode], (error, results) => {
			    if (error) {
			      throw error
			    }
			})

			res.send('Ok');
		}else{
			res.send('Email already in use');
		}
  	}else{
		res.send('Fail'); 
	  }
});


app.post('/api/depositSavings', (req, res) => {	//api for deposit into checking
	
	let date =  new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
	
	const {first_name, last_name, email, amount, balance} = req.body
	let total = balance + amount;	//add amount to users checking
	console.log('depositing');	

	pool.query('INSERT INTO transactions (transaction_id, email, date_stamp, amount, balance, first_name, last_name) VALUES (DEFAULT, $1, $2, $3, $4, $5, $6)', [email, date, amount, total, first_name, last_name], (error, results) => {
	    if (error) {
	      throw error
	    }
	})

	//update balance of checking
	pool.query("UPDATE bank_accounts SET balance=$1 where email=$2 AND type='savings'", [total, email], (error, results) => {	
	    if (error) {
	      throw error
	    }
	})	
	
	res.send("Ok");

});

app.post('/api/withdrawSavings', (req, res) => {	//api for withdrawing from checking
	console.log('withdrawing');
	
	let date =  new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
	const {first_name, last_name, email, amount, balance} = req.body
	let total = balance - amount;	//add amount to users checking
	

	pool.query('INSERT INTO transactions (transaction_id, email, date_stamp, amount, balance, first_name, last_name) VALUES (DEFAULT, $1, $2, $3, $4, $5, $6)', [email, date, amount*-1, total, first_name, last_name], (error, results) => {
	    if (error) {
	      throw error
	    }
	})

	//update balance of checking
	pool.query("UPDATE bank_accounts SET balance=$1 where email=$2 AND type='savings'", [total, email], (error, results) => {	
	    if (error) {
	      throw error
	    }
	})	
	
	res.send("Ok");

});


app.post('/api/depositChecking', (req, res) => {	//api for deposit into checking
	
	let date =  new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
	
	const {first_name, last_name, email, amount, balance} = req.body
	let total = balance + amount;	//add amount to users checking
	console.log('depositing');	

	pool.query('INSERT INTO transactions (transaction_id, email, date_stamp, amount, balance, first_name, last_name) VALUES (DEFAULT, $1, $2, $3, $4, $5, $6)', [email, date, amount, total, first_name, last_name], (error, results) => {
	    if (error) {
	      throw error
	    }
	})

	//update balance of checking
	pool.query("UPDATE bank_accounts SET balance=$1 where email=$2 AND type='checking'", [total, email], (error, results) => {	
	    if (error) {
	      throw error
	    }
	})	
	
	res.send("Ok");

});

app.post('/api/withdrawChecking', (req, res) => {	//api for withdrawing from checking
	console.log('withdrawing');
	
	let date =  new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
	const {first_name, last_name, email, amount, balance} = req.body
	let total = balance - amount;	//add amount to users checking
	

	pool.query('INSERT INTO transactions (transaction_id, email, date_stamp, amount, balance, first_name, last_name) VALUES (DEFAULT, $1, $2, $3, $4, $5, $6)', [email, date, amount*-1, total, first_name, last_name], (error, results) => {
	    if (error) {
	      throw error
	    }
	})

	//update balance of checking
	pool.query("UPDATE bank_accounts SET balance=$1 where email=$2 AND type='checking'", [total, email], (error, results) => {	
	    if (error) {
	      throw error
	    }
	})	
	
	res.send("Ok");

});


app.post('/api/transferToInternal', (req, res) => {	//api for transferring funds from one checking account to another account (internal)

	const {first_name, last_name, emailFrom, emailTo, amount, balance, toBalance, toFirstName, toLastName} = req.body	//balance represents checking account of emailFrom
	
	if(amount > balance){
		res.send("Error, not enough funds");	//if emailFrom doesn't have enough funds to transfer	
	}

	let date =  new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
	
	pool.query('INSERT INTO transactions (transaction_id, email, date_stamp, amount, balance, first_name, last_name) VALUES (DEFAULT, $1, $2, $3, $4, $5, $6)', [emailTo, date, amount, toBalance+amount, toFirstName, toLastName], (error, results) => {
	    if (error) {
	      throw error
	    }
	})


	pool.query('INSERT INTO transactions (transaction_id, email, date_stamp, amount, balance, first_name, last_name) VALUES (DEFAULT, $1, $2, $3, $4, $5, $6)', [emailFrom, date, amount*-1, balance-amount, first_name, last_name], (error, results) => {
	    if (error) {
	      throw error
	    }
	})

	pool.query("UPDATE bank_accounts SET balance=balance-$1 where email=$2 AND type='checking'", [amount, emailFrom], (error, results) => {	//update checking of emailFrom
	    if (error) {
	      throw error
	    }
	})	

	pool.query("UPDATE bank_accounts SET balance=balance+$1 where email=$2 AND type='checking'", [amount, emailTo], (error, results) => {	//update checking of emailTo
	    if (error) {
	      throw error
	    }
	})
	
	res.send("Ok");

});


//need to add it to the transaction table?
app.post('/api/transferSelf', (req, res) => {	//api to transfer from savings to checking or checking to savings for self

	const {email, accountFrom, accountTo, amount, toBalance, fromBalance} = req.body

	let date =  new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

	let total = 0;
	
	let from = '';
        let to = '';
        let balanceFrom = 0;
        let balanceTo = 0;
        
        if(accountFrom === 'checking'){
            from = 'checking';
            to = 'savings';
            balanceFrom = fromBalance;
            balanceTo = toBalance;
        }else{
            to = 'checking';
            from = 'savings';  
            balanceFrom = fromBalance;
            balanceTo = toBalance;
        }
	
	console.log("to: ");
	console.log(to);
	console.log("from : ");
	console.log(from);

	if(amount > fromBalance){ //accountFrom balance
		res.send("Error, not enough funds");
	}else{
		
		//first_name, last_name, email, account_number, status, balance, type
		pool.query('UPDATE bank_accounts SET balance=balance-$1 where email=$2 AND type=$3', [amount,email, from], (error, results) => {	
		    if (error) {
		      throw error
		    }
		})
		
		pool.query('UPDATE bank_accounts SET balance=balance+$1 where email=$2 AND type=$3', [amount,email, to], (error, results) => {	
		    if (error) {
		      throw error
		    }
		})
		
		console.log("transferred self");
		
		res.send("Ok");
	}

});


app.post('/api/getToBalance', (req, res) => {	//api for getting balance of a customers checking and savings account

	const {emailTo} = req.body
	
	const s = [];		//holds balance
	
	console.log("getToBalance API called");
	
	pool.connect(function(err, client, done) {
		    const query = client.query(new pg.Query("SELECT * from bank_accounts where type='checking' AND email=$1",[emailTo]))


		    query.on('row', (row) => {	//push transaction of user from database to data structure
			    s.push(row);
		    })
		    query.on('error', (res) => {	//error
		    })
		   query.on("end", function (result) {
			res.json({array:s});
		   });

		    done()
	})

});


app.post('/api/allBalance', (req, res) => {	//api for getting balance of a customers checking and savings account

	const {email} = req.body
	
	const hold = [];		//holds balance
	
	pool.connect(function(err, client, done) {
	    const query = client.query(new pg.Query("SELECT balance from bank_accounts where email=$1", [email]))

	    query.on('row', (row) => {	//push transaction of user from database to data structure
		    hold.push(row);
	    })
	    query.on('error', (res) => {	//error
		console.log(res);
	    })
	   query.on("end", function (result) {
		res.json({balanceUser: hold});	//should push two rows, checking and savings
	    });

	    done()
	})
	
});

app.post('/api/balanceAllUsers', (req, res) => {  //api for getting balance of all customers checking and savings account for bank manager

	const hold = [];		//holds balance
		
	pool.connect(function(err, client, done) {
	    const query = client.query(new pg.Query("SELECT * from bank_accounts"))

	    query.on('row', (row) => {	//push transaction of user from database to data structure
		    hold.push(row);
	    })
	    query.on('error', (res) => {	//error
		console.log(res);
	    })
	   query.on("end", function (result) {
		res.json({balanceUser: hold});	//should push two rows, checking and savings for each user
	    });

	    done()
	})
	
});

app.post('/api/getUserTransactions',(req,res)=>{		//get all transactions for a particular user
	let {email} = req.body;
	
	const transactionsArray = []		//holds transactions

	pool.connect(function(err, client, done) {		
		    const query = client.query(new pg.Query("SELECT * from transactions where email=$1", [email]))

		    query.on('row', (row) => {	//push transaction of user from database to data structure
			    transactionsArray.push(row);
		    })
		    query.on('error', (res) => {	//error
			console.log(res);
		    })
		   query.on("end", function (result) {
			res.json({array:transactionsArray});
		    });

		    done()
	})	
})


app.post('/api/updateAccountNumber', (req, res) => 	//update bank account number for checking and savings by adding constants
{	

	const {email} = req.body;

	
	pool.query("UPDATE bank_accounts SET account_number=account_number+$1 where email=$2 AND type='savings'", [global.savingsAccountNumber,email], (error, results) => {	
	    if (error) 
		{
	      throw error
	    }
	});
	
	pool.query("UPDATE bank_accounts SET account_number=account_number+$1 where email=$2 AND type='checking'", [global.checkingAccountNumber,email], (error, results) => {	
	    if (error) {
	      throw error
	    }
	})
	
	res.send("ok");

});




app.post('/api/closeAccount', (req, res) => {	//api for closing either a savings or checking bank account
	
	const {email, type} = req.body		//type represents savings or checking account
	
	console.log('closing ' + type + ' account for ' + email);
	
	pool.query("UPDATE bank_accounts SET status='Closed' where email=$1 AND type=$2", [email, type], (error, results) => {	
	    if (error) {
	      throw error
	    }
	})	
	
	res.send("Ok");
});


app.post('/api/openAccount', (req, res) => {	//api for opening either a savings or checking bank account
	
	const {email, type} = req.body		//type represents savings or checking account
	
	console.log('opening ' + type + ' account for ' + email);
	
	pool.query("UPDATE bank_accounts SET status='Open' where email=$1 AND type=$2", [email, type], (error, results) => {	//update status 
	    if (error) {
	      throw error
	    }
	})
	
	res.send("Ok");
});

app.post('/api/autobill',(req,res)=>{		//autobill api to retrieve autobill information for a user
	let {email} = req.body;
	
	const holdArray = []		//holds autobill rows

	pool.connect(function(err, client, done) {		
	    const query = client.query(new pg.Query("SELECT * from auto_bill where email = $1", [email]))

	    query.on('row', (row) => {	//push transaction of user from database to data structure
		  holdArray.push(row);
	    })
	    query.on('error', (res) => {	//error
		console.log(res);
	    })
	   query.on("end", function (result) {
		res.json({array:holdArray});
	    });

	    done()
	})	

})

app.post('/api/storeautobill',(req,res)=>{		//autobill api to retrieve autobill information for a user
	let {email, amount, name, date} = req.body;
	
	pool.query('INSERT INTO auto_bill (email, amount, bill_name, bill_date) VALUES ($1, $2, $3, $4)', [email, amount, name, date], (error, results) => {
	    if (error) {
	      throw error
	    }
	})
	
	res.send("Ok");
})


app.post('/api/removeautobill',(req,res)=>{		//autobill api to retrieve autobill information for a user
	let {email, name} = req.body;
	console.log(name);
	
	pool.query('delete from auto_bill where email=$1 AND bill_name = $2', [email, name], (error, results) => {
	    if (error) {
	      throw error
	    }
	})
	
	res.send("Ok");

})

app.post('/api/findBill',(req,res)=>{		//autobill api to retrieve autobill information for a user
	let {email, name} = req.body;
	
	
	const holdArray = []		//holds autobill rows

	pool.connect(function(err, client, done) {		
	    const query = client.query(new pg.Query("SELECT * from auto_bill where email = $1 AND bill_name = $2", [email, name.toLowerCase()]))

	    query.on('row', (row) => {	//push transaction of user from database to data structure
		  holdArray.push(row);
	    })
	    query.on('error', (res) => {	//error
		console.log(res);
	    })
	   query.on("end", function (result) {
		res.json({array:holdArray});
	    });

	    done()
	})	

})
    

// app.listen(PORT, () => console.log(`http://localhost'${PORT}`))
app.listen(process.env.PORT || 3000, function(){
  console.log("Listening on port %d in %s mode", this.address().port, app.settings.env);
});

  
