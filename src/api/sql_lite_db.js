/**
 * [sql_lite_db.js]
 * 
 *  encoding=utf-8
 */


require('date-utils'); // Data() クラスのtoString()を拡張してくれる。
// const debug = require("./debugger.js");
var lib = require("./factory4require.js");
var factoryImpl = { // require()を使う代わりに、new Factory() する。
	"crypto" : new lib.Factory4Require("crypto"),
    "sqlite3" : new lib.Factory4Require("sqlite3"),  // https://www.npmjs.com/package/mssql
    "db" : new lib.Factory( {} ) // データベースごとにハッシュマップで持つ。
};

// UTデバッグ用のHookポイント。運用では外部公開しないメソッドはこっちにまとめる。
exports.factoryImpl = factoryImpl;




/**
 * 渡されたMACアドレス（じゃなくても良いけど）から、ハッシュ値を求める。
 * 一応、ハッシュパターンは選択できるようにしておく。
 * 
 * @param{String} plainText 変換元になる文字列。
 * @param{String} ハッシュ値の計算方法。cryptoモジュール準拠。とりあえず「md5」設定しておけ。
 */
var getHashHexStr = function( plainText, algorithm ){
	var crypto = factoryImpl.crypto.getInstance();
	var hashsum = crypto.createHash(algorithm);
	hashsum.update(plainText);

	// cryptoモジュール（node.js標準）の詳細は以下のURL参照
	// http://qiita.com/_daisuke/items/990513e89ca169e9c4ad
	// http://kaworu.jpn.org/javascript/node.js%E3%81%A7%E3%83%8F%E3%83%83%E3%82%B7%E3%83%A5%E3%82%92%E8%A8%88%E7%AE%97%E3%81%99%E3%82%8B
	// http://nodejs.jp/nodejs.org_ja/docs/v0.4/api/crypto.html

	return hashsum.digest("hex");
};
exports.getHashHexStr = getHashHexStr;


var _wrapStringValue = function( deviceKey ){
	return getHashHexStr( deviceKey, "md5" );
};
factoryImpl[ "_wrapStringValue" ] = new lib.Factory( _wrapStringValue );




/**
 * HTTP::GETデータから、「SHOW操作」に必要なデータ郡を取得。
 * API呼び出しのフォーマットのチェックを兼ねる。フォーマット不正なら { "invalid" : "理由" } を返却。
 * 入力データは、getData = { device_key, pass_key } が期待値。
 * pass_keyは無くともスルーするが、その後の検証フェースでNGになる（見込み）。
 * 
 * @returns オブジェクト{ device_key: "" }。フォーマット違反なら{ "invalid" : "理由" }
 */
var getShowObjectFromGetData = function( getData ){
	var valid_data = {}
	var date_start = (function( pastDay ){
		var now_date = new Date();
		var base_sec = now_date.getTime() - pastDay * 86400000; //日数 * 1日のミリ秒数;
		now_date.setTime( base_sec );
		return now_date;
	}( 7 )); // 1週間前までを取得、を基本とする。
	var date_end = new Date(); // 現時点までを取得。

	if( getData[ "device_key" ] ){
		valid_data[ "device_key" ] = getData["device_key"];
		valid_data[ "date_start" ] = getData.date_start ? getData.date_start : date_start.toFormat("YYYY-MM-DD"); // data-utilsモジュールでの拡張を利用。
		valid_data[ "date_end"   ] = getData.date_end ? getData.date_end : date_end.toFormat("YYYY-MM-DD");
		// 終端は、Query時に「その日の23:59」を指定しているので、「今日」でOK。

		if( !valid_data.date_start.match(/\d{4,4}-\d{2,2}-\d{2,2}/) ){
			valid_data[ "invalid" ] = "format of date is wrong.";
		}
		if( !valid_data.date_end.match(/\d{4,4}-\d{2,2}-\d{2,2}/) ){
			valid_data[ "invalid" ] = "format of date is wrong.";
		}
		if( getData["pass_key"] ){
			valid_data["pass_key"] = getData.pass_key;
		}
	}else{
		valid_data[ "invalid" ] = "parameter is INVAILD.";
	}

	return valid_data;
};
exports.getShowObjectFromGetData = getShowObjectFromGetData;



var getInsertObjectFromPostData = function( postData ){
	var valid_data = {}
	
		if( postData["type_value"] && isFinite(postData[ "type_value" ]) ){
			// 数字変換（int）出来る事、も必須。ただし、文字列のままで格納。
			valid_data[ "type_value" ] = postData[ "type_value" ];
		}else{
			valid_data[ "invalid" ] = "type_value is NOT Number.";
		}
	
		if( postData["device_key"] ){
			valid_data[ "device_key" ] = postData["device_key"];
		}else{
			valid_data[ "invalid" ] = "there is NOT type_value.";
		}

		return valid_data;
};
exports.getInsertObjectFromPostData = getInsertObjectFromPostData;




/**
 * ※SQL接続を生成。
 * 
 * @param{Object} sqlConfig     SQL接続情報。
 */
var createPromiseForSqlConnection = function( sqlConfig ){
	var dbs = factoryImpl.db.getInstance();
	var databaseName = sqlConfig.database;

	if( dbs[ databaseName ] ){
		return Promise.resolve()
	}else{
		return new Promise(function(resolve,reject){
			var sqlite = factoryImpl.sqlite3.getInstance().verbose();
			var db_connect = new sqlite.Database( databaseName, (err) =>{
				if( !err ){
					dbs[ databaseName ] = db_connect;
					resolve();
				}else{
					reject(err);
				}
			});
		})
	}
};
exports.createPromiseForSqlConnection = createPromiseForSqlConnection;


var closeConnection = function( databaseName ){
	var dbs = factoryImpl.db.getInstance();
	var db = dbs[ databaseName ];
	if( !db ){
		return Promise.reject({
			"isReady" : false
		});
	}

    return new Promise(function(resolve,reject){
		db.close((err)=>{
			if(!err){
				dbs[ databaseName ] = null;
				resolve();
			}else{
				reject(err)
			}
		});
    });
};
exports.closeConnection = closeConnection;



var setupTable1st = function( databaseName ){
	var dbs = factoryImpl.db.getInstance();
	var db = dbs[ databaseName ]; // 異常系は省略
	var createActivtyLogTable = new Promise(function(resolve,reject){
		var query_str = "CREATE TABLE activitylogs([id] [integer] PRIMARY KEY AUTOINCREMENT NOT NULL, [created_at] [datetime] NOT NULL, [type] [int] NULL, [owners_hash] [char](64) NULL )";

		db.all(query_str, [], (err, rows) => { // get()でショートハンドしても良いが、Queryの分かりやすさ考慮でall()する。
			if(!err){
				resolve();
			}else{
				reject(err);
			}
		});
	});	
	var createPermissionTable = new Promise(function(resolve,reject){
		var query_str = "CREATE TABLE owners_permission([id] [integer] PRIMARY KEY AUTOINCREMENT NOT NULL, [owners_hash] [char](64) NOT NULL, [password] [char](16) NULL, [max_entrys] [int] NOT NULL, UNIQUE ([owners_hash]) )";

		db.all(query_str, [], (err, rows) => { // get()でショートハンドしても良いが、Queryの分かりやすさ考慮でall()する。
			if(!err){
				resolve();
			}else{
				reject(err);
			}
		});
	});	
	return new Promise(function(resolve,reject){
		Promise.all( [createPermissionTable, createActivtyLogTable] ).then(()=>{
			return new Promise(function(res, rej){
				var query_str = "select * from sqlite_master;";
				
				db.all(query_str, [], (err, rows) => { // get()でショートハンドしても良いが、Queryの分かりやすさ考慮でall()する。
					if(!err){
						res(rows);
					}else{
						rej(err);
					}
				});
			});
		}).then(( rows )=>{
			resolve( rows )
		}).catch((err)=>{
			reject(err);
		});
	});
};
exports.setupTable1st = setupTable1st;



/**
 * ユーザーを、テーブルに登録する。
 * 
 * @param{String} databaseName データベース名
 * @param{String} deviceKey アクセスデバイスごとの一意の識別子（※ハッシュにしようか？）
 * @param{Number} maxEntrys ユーザー事（デバイス事）の可能な最大登録数。
 * @param{String} password ユーザーごとのパスワード（無しも可とする？）
 * @returns{Promise} 登録結果。Promise経由で非同期に返る。resolve()は登録内容。reject()はエラー内容が引数に入る。
 */
var addNewUser = function(databaseName, deviceKey, maxEntrys, passwordStr ){
	var dbs = factoryImpl.db.getInstance();
	var db = dbs[ databaseName ];
	if( !db ){
		return Promise.reject({
			"isReady" : false
		});
	}

	return new Promise(function(resolve,reject){
		var wrapString = factoryImpl._wrapStringValue.getInstance(); 
		var wrappedDeviceKey = wrapString( deviceKey );
		var wrappedPassWord = wrapString( passwordStr )
		var query_str = "INSERT INTO owners_permission([owners_hash], [max_entrys], [password])";
		query_str += "VALUES('" + wrappedDeviceKey + "', " + maxEntrys + ", '" + wrappedPassWord + "')";

		db.all(query_str, [], (err, rows) => {
			if(!err){
				var insertedData = {
					"device_key" : deviceKey,
					"password"   : passwordStr
				};
				return resolve( insertedData );
			}else{
				// ToDo.
				// 重複キーだと、以下のerrが返る。
				// このまま返す、、、のは将来的に修正したいね。
				// { [Error: SQLITE_CONSTRAINT: UNIQUE constraint failed: owners_permission.owners_hash] errno: 19, code: 'SQLITE_CONSTRAINT' }
				reject({
					"cant_to_insert" : err
				});
			}
		});
	});
};
exports.addNewUser = addNewUser;



/**
 * 登録済みのユーザー数を取得する。
 * 
 * @param{String} databaseName データベース名
 * @returns{Promise} 検証結果。Promise経由で非同期に返る。
 */
var getNumberOfUsers = function(databaseName ){
	var dbs = factoryImpl.db.getInstance();
	var db = dbs[ databaseName ];
	if( !db ){
		return Promise.reject({
			"isReady" : false
		});
	}

	return new Promise(function(resolve,reject){
		var query_str = "SELECT count(*) FROM owners_permission";

		db.all(query_str, [], (err, rows) => {
			var item;
			if(!err){
				item = rows[0];
				return resolve( item["count(*)"] );
			}else{
				reject({
					"isEnableValidationProcedure" : false
				});
			}
		});
	});
};
exports.getNumberOfUsers = getNumberOfUsers;






/**
 * SQLへのアクセスが許可されたアクセス元か？
 * 
 * @param{String} databaseName データベース名
 * @param{String} deviceKey アクセスデバイスごとの一意の識別子。これが「認証用SQLデータベース」に入っていればアクセスOK。
 * @param{String} password  アクセスデバイスと紐づいたパスワード。上記の識別子と合わせて認証する。
 * @returns{Promise} 検証結果。Promise経由で非同期に返る。resolve()は引数無し。reject()はエラー内容が引数に入る。
 */
var isOwnerValid = function( databaseName, deviceKey, password ){
	var dbs = factoryImpl.db.getInstance();
	var db = dbs[ databaseName ];
	if( !db ){
		return Promise.reject({
			"isReady" : false
		});
	}

	return new Promise(function(resolve,reject){
		var wrapString = factoryImpl._wrapStringValue.getInstance(); 
		var wrappedDeviceKey = wrapString( deviceKey );
		var wrappedPassWord  = wrapString( password ); 
		var query_str = "SELECT owners_hash, password, max_entrys";
		query_str += " FROM owners_permission";
		query_str += " WHERE [owners_hash]='" + wrappedDeviceKey + "'";

		db.all(query_str, [], (err, rows) => { // get()でショートハンドしても良いが、Queryの分かりやすさ考慮でall()する。
			if(!err){
				if( (rows.length > 0) && (wrappedPassWord == rows[0].password) ){
					resolve( rows[0].max_entrys );
				}else{
					reject({
						"isDevicePermission" : false
					});
				}
			}else{
				reject({
					"isEnableValidationProcedure" : false
				});
			}
		});
	});
}
exports.isOwnerValid = isOwnerValid;




/**
 * デバイスキーを識別子として、ユーザーアクションをデータベースに記録する。
 * 記録する時刻は「これが呼ばれた時刻」とする。
 * @param{String} databaseName データベース名
 * @param{String} deviceKey デバイスの識別キー
 * @param{Number} typeOfAction 記録するアクション（定数値）
 * @returns{Promise} 実行結果を返すPromiseオブジェクト。成功時は、記録されたデバイス名とアクション値が返却される。
 */
var addActivityLog2Database = function( databaseName, deviceKey, typeOfAction ){
	var dbs = factoryImpl.db.getInstance();
	var db = dbs[ databaseName ];
	if( !db ){
		return Promise.reject({
			"isReady" : false
		});
	}
	return new Promise(function(resolve,reject){
		var wrapString = factoryImpl._wrapStringValue.getInstance(); 
		var wrappedDeviceKey = wrapString( deviceKey );
		var now_date = new Date();
		var date_str = now_date.toFormat("YYYY-MM-DD HH24:MI:SS.000"); // data-utilsモジュールでの拡張を利用。
		var query_str = "INSERT INTO activitylogs(created_at, type, owners_hash ) ";
		query_str += "VALUES('" + date_str + "', " + typeOfAction + ", '" + wrappedDeviceKey + "')";

		db.all(query_str, [], (err, rows) => {
			if(!err){
				var insertedData = {
					"type_value" : typeOfAction,
					"device_key" : deviceKey
				};
				resolve( insertedData );
			}else{
				reject({
					"isEnableValidationProcedure" : false
				});
			}
		});
	});
};
exports.addActivityLog2Database = addActivityLog2Database;




/**
 * デバイス識別キーに紐づいたバッテリーログを、指定されたデータベースから取得する。
 * @param{String} Database データベース名
 * @param{String} deviceKey デバイスの識別キー
 * @param{Object} period 取得する日付の期間 { start : null, end : null }を許容する。ただし、使う場合はyyyy-mm-dd整形済みを前提。
 * @returns{Promise} SQLからの取得結果を返すPromiseオブジェクト。成功時resolve( recordset ) 、失敗時reject( err )。
 */
var getListOfActivityLogWhereDeviceKey = function( databaseName, deviceKey, period ){
	var wrapString = factoryImpl._wrapStringValue.getInstance(); 
	var wrappedDeviceKey = wrapString( deviceKey );

	var dbs = factoryImpl.db.getInstance();
	var db = dbs[ databaseName ];
	if( !db ){
		return Promise.reject({
			"isReady" : false
		});
	}

	var query_str = "SELECT created_at, type FROM activitylogs";
	query_str += " WHERE [owners_hash]='" + wrappedDeviceKey + "'"; // 固定長文字列でも、後ろの空白は無視してくれるようだ。
	// http://sql55.com/column/string-comparison.php
	// > SQL Server では文字列を比較する際、比較対象の 2 つの文字列の長さが違った場合、
	// > 短い方の文字列の後ろにスペースを足して、長さの長い方にあわせてから比較します。
	if( period && period.start ){
		query_str += " AND [created_at] > '";
		query_str += period.start;
		query_str += "'";
	}
	if( period && period.end ){
		query_str += " AND [created_at] <= '";
		query_str += period.end;
		query_str += " 23:59'"; // その日の最後、として指定する。※「T」は付けない（json変換後だと付いてくるけど）
	}

	return new Promise(function(resolve,reject){
		db.all(query_str, [], (err, rows) => {
			if(!err){
				return resolve( rows );
			}else{
				return reject( err );
			}
		});
	});
};
exports.getListOfActivityLogWhereDeviceKey = getListOfActivityLogWhereDeviceKey;






