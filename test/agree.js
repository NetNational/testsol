let getContract = require("./common/contract_com.js").GetContract;
let filePath = "./ethererscan/agreement_abi.json";
let web3 = require("./common/contract_com.js").web3;
let Web3EthAbi = require('web3-eth-abi');
let comVar = require("./common/globe.js");
let dbFun = require("./db/agree.js");
let dbHouseFun = require("./db/house.js");
let nonceMap = new Map();
let RegisterFun = require("./get_register");
let TokenFun = require("./get_token");
let contractAddress = comVar.agreeConAddr;
async function initAgreeFun() {
	let contract = await getContract(filePath, contractAddress);
	return contract;
}

function signAgreement(db, contract, username, houseId, houseAddr, falsify, phoneNum, idCard, signHowLong, rental, houseDeadline, houseUse, payOne, addr, privateKey) {	
	return new Promise((resolve, reject) => {
		console.log("==start=signAgreement=", contract.methods);
		// 先查询是否已经签约
		dbFun.querySignInfo(db, houseId).then(result => {
			if (result && result.length != 0) {
				resolve({status:false, err:"已签订该房屋合同!"});
			} else {
				const reqFun = contract.methods.newAgreement(username, idCard, phoneNum, rental, signHowLong, houseId, houseAddr, falsify, houseDeadline, payOne, houseUse);
			    const reqABI = reqFun.encodeABI();
			    console.log("Start sign the agreement!", addr);
			    packSendMsg(addr, privateKey, contractAddress, reqABI).then(receipt => {
		        	if (receipt) {
		        		console.log("Landlord sign success!");
		        		let [flag, ctx, logRes] = decodeLog(contract, receipt, 'LandLordSign');
		                if (flag) {
		                	console.log("request house receive: ", ctx);
		                	let txHash = ctx.transactionHash;
		                	resolve({status:flag, data: txHash});
		                	let house_state = comVar.houseState.UnderContract;    	
			                dbHouseFun.updateReleaseInfo(db, "", addr, houseId, house_state);
		                	dbFun.insertAgreeRecord(db, username, phoneNum, addr, houseAddr, rental, signHowLong, txHash, houseId, falsify, houseDeadline, houseUse, payOne);
		                } else {
		                	resolve({status:false, err:"签订合同失败!"});
		                }
		        	} 
				}).catch(err => {
					console.log("Sign fail!", err);
					reject({status: false, err: "请检查是否已经登录、余额能否满足租金要求、是否已预订该房屋！"});
				});
			}
		}).catch(err => {
			reject(err);
		});
	});
}

function leaserSign(db, contract, leaserName, houseId, phoneNum, idCard, renewalMonth, breakMonth, addr, privateKey) {	
	return new Promise((resolve, reject) => {
		console.log("==start=leaser sign the contract=");
		let signHowLong = 12, rental = 3200;
		const reqFun = contract.methods.tenantSign(houseId, leaserName, phoneNum, idCard, renewalMonth, breakMonth);
	    const reqABI = reqFun.encodeABI();
	    console.log("Start sign the agreement!", addr);
	    packSendMsg(addr, privateKey, contractAddress, reqABI).then(receipt => {
        	if (receipt) {
        		console.log("Leaser sign success!");
        		let [flag, ctx, logRes] = decodeLog(contract, receipt, 'LeaserSign');
                if (flag) {
                	console.log("request house receive: ", ctx);
                	let txHash = ctx.transactionHash;
                	resolve({status:flag, data: txHash});
                	let house_state = comVar.houseState.Renting; 
                	dbFun.updateAgreeRecord(db, houseId, leaserName, phoneNum, renewalMonth, breakMonth, addr);
                } else {
                	resolve({status:false, err:"签订合同失败!"});
                }
        	} 
		}).catch(err => {
			console.log("Sign fail!", err);
			reject({status: false, err: "请检查是否已经登录、余额能否满足租金要求、是否已预订该房屋！"});
		});
	});
}



function decodeLog(contract, receipt, eventName) {
	const eventJsonInterface = contract._jsonInterface.find(
      o => (o.name === eventName) && o.type === 'event');
    if (JSON.stringify(receipt.logs) != '[]') {
        const log = receipt.logs.find(
          l => l.topics.includes(eventJsonInterface.signature)
        );
        let decodeLog = Web3EthAbi.decodeLog(eventJsonInterface.inputs, log.data, log.topics.slice(1));
        console.log("==decode log==",decodeLog)
        return [true, receipt, decodeLog];
    } else {
      return [false, "Cannt find logs", {}];
    }
}

function packSendMsg(formAddr, privateKey, toAddr, createABI) {
		let gas, nonce;
		return new Promise((resolve, reject) => {
			gas = 20000000000;
			web3.eth.getTransactionCount(formAddr, 'pending').then(_nonce => {
				if (nonceMap.has(_nonce)) {
					_nonce += 1
				}
				nonceMap.set(_nonce, true);
				nonce = _nonce.toString(16);
				const txParams = {
				  gasPrice: gas,
			      gasLimit: 2000000,
			      to: toAddr,
			      data: createABI,
			      from: formAddr,
			      chainId: 3,
			      nonce: '0x' + nonce
				}
				console.log("start sign the transaction")
				web3.eth.accounts.signTransaction(txParams, privateKey).then(signedTx => {
					console.log("start send the transaction")
			 		web3.eth.sendSignedTransaction(signedTx.rawTransaction).then(receipt => {
			 			if (receipt.status) {
			 				console.log(receipt.transactionHash)
			 				resolve(receipt);
			 			} else {
			 				reject("发送交易失败!");
			 			}
			 		}).catch(err1 => {
			 			console.log("Send Fail:", err1);
			 			reject(err1);
			 		});
				}).catch(err => {
		 			console.log("Sign Fail:", err);
		 			reject(err);
		 		});;
			}).catch(err => {
	 			console.log("GetTransactionCount Fail:", err);
	 			reject(err);
	 		});
		});	 	
}


module.exports = {
	initAgreeFun,
	signAgreement,
	leaserSign
}