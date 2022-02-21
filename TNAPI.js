const path = require('path');
const fs = require('fs');
const https = require('https');
const Message = require('./message');
const MultiMediaMessage = require("./multi_media_message");
const MessageContainer = require("./message_container");
const mime = require("mime");
const { EventEmitter } = require('events');

const MESSAGE_TYPE = 0;
const MULTIMEDIA_MESSAGE_TYPE = 1;

const SENT_MESSAGE_TYPE = 2;
const RECEIVED_MESSAGE_TYPE = 1;

const SIP_ENDPOINT = "prod.tncp.textnow.com";

class Client extends EventEmitter {
    /**
     * Please run init after this.  I needed async, I'm sorry.
     */
    constructor(/*username, sid_cookie, csrf_cookie*/) {
        /*await this.init(username, sid_cookie, csrf_cookie);*/
        super();
    }
    async init(username, sid_cookie, csrf_cookie) {
        this._user_cookies = {};
        this._good_parse = false;
        this._user_cookies_file = path.join(path.dirname(__dirname), 'user_cookies.json');

        try {
            this._user_cookies = JSON.parse(fs.readFileSync(this._user_cookies_file, 'utf-8'));
            this._good_parse = true;
        } catch {
            fs.writeFileSync(this._user_cookies_file, "{}");
        }

        this.username = username;
        this.allowed_events = ["message"];

        this.events = [];
        this.cookies = {};

        if (this.username in Object.keys(this._user_cookies)) {
            const sid = sid_cookie ? sid_cookie : this._user_cookies[this.username]['sid'];
            const csrf = csrf_cookie ? csrf_cookie : this._user_cookies[this.username]['csrf'];
            this.cookies = {
                'connect.sid': sid,
                '_csrf': csrf,
            };
            if (sid_cookie && csrf_cookie && !(this._good_parse)) {
                fs.writeFileSync(this._user_cookies_file, JSON.stringify(this._user_cookies), "utf-8");
            }
        }
        else {
            const { sid, csrf } = (sid_cookie && csrf_cookie) ? ({ sid: sid_cookie, csrf: csrf_cookie }) : (console.error("Please provide an sid and csrf!") && process.exit());
            this.cookies = {
                'connect.sid': sid,
                '_csrf': csrf,
            };
            this._user_cookies[this.username] = {
                'sid': sid,
                'csrf': csrf,
            };
            fs.writeFileSync(this._user_cookies_file, JSON.stringify(this._user_cookies));
        }
        this.headers = {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.104 Safari/537.36 ',
            'x-csrf-token': await this.get_initial_csrf_token()
        };
        setInterval(async () => {
            const unread_msgs = await this.get_unread_messages();
            for (let msg = 0; msg < unread_msgs.length; msg++) {
                await unread_msgs[msg].mark_as_read();
                console.log(unread_msgs[msg]);
                this.emit("message", unread_msgs[msg]);
            }
        }, 1000);
    }
    /**
     * @private
     * @param {String} text 
     * @returns {String}
     */
    _replace_newlines(text) {
        return text.replace(/(?<!\\)\n/g, "\n");
    }
    /**
     * 
     * @param {Object} _cookies 
     * @returns {String} Cookies primed for the cookie parameter 
     */
    processCookies(_cookies) {
        let outputString = "";
        let starter = true;
        for (var x in Object.keys(_cookies)) {
            if (!starter) {
                outputString += ";";
            }
            else {
                starter = false;
            }
            outputString += `${Object.keys(_cookies)[x]}=${_cookies[Object.keys(_cookies)[x]]}`;
        }
        return outputString;
    }
    reverseCookie(_set_cookie) {
        const kwookies = _set_cookie.map(elem => elem.split("; ")[0]);
        for (let x = 0; x < kwookies.length; x++) {
            let cookie = kwookies[x];
            this.cookies[cookie.split("=")[0]] = cookie.split("=")[1];
        }
        return 
    }
    get_initial_csrf_token() {
        const req = https.request('https://www.textnow.com/messaging', {
            headers: {
                cookie: this.processCookies(this.cookies)
            }
        });
        const myPromise = new Promise((resolve, reject) => {
            req.on("response", (response) => {
                var body = "";
                response.on("data", data => {
                    body += data;
                });
                response.on("end", () => {
                    if (response.statusCode == 200) {
                        this.reverseCookie(response.headers['set-cookie']);
                        resolve(/csrf-token" content="(?<csrf_token>.*?)"/.exec(body).groups.csrf_token);
                    }
                    else {
                        reject({ response: response, error: "Non 200 response." });
                    }
                });
            })
        });
        req.end();
        return myPromise;
    }
    auth_reset(sid_cookie, csrf_cookie) {
        let user_cookies = JSON.parse(fs.readFileSync(this._user_cookies_file, "utf-8"));
        if (this.username in Object.keys(user_cookies)) {
            delete user_cookies[this.username];

            fs.writeFileSync(this._user_cookies_file, JSON.stringify(user_cookies));

            this.init(this.username, sid_cookie, csrf_cookie);
        }
        else {
            if (sid_cookie && csrf_cookie) {
                user_cookies[this.username] = {
                    "sid": sid_cookie,
                    "csrf": csrf_cookie
                }

                fs.writeFileSync(this._user_cookies_file, JSON.stringify(user_cookies))
            }
            else {
                throw Error("You haven't authenticated before.");
            }
        }
    }
    get_messages() {
        const req = https.request("https://www.textnow.com/api/users/" + this.username + "/messages", {
            headers: {
                ...this.headers,
                cookie: this.processCookies(this.cookies)
            }
        });
        const myPromise = new Promise((resolve, reject) => {
            req.on("error", err => {
                reject(err);
            });
            req.on("response", response => {
                let body = "";
                response.on("data", data => {
                    body += data;
                });
                response.on("end", () => {
                    this.reverseCookie(response.headers['set-cookie']);
                    if (Math.floor(response.statusCode / 100) == 2) {
                        const raw_messages = JSON.parse(body).messages;
                        let messages = raw_messages.map(msg => {
                            return !(msg["message"].startsWith("http")) ? new Message(msg, this) : new MultiMediaMessage(msg, this);
                        });
                        resolve(new MessageContainer(messages, this));
                    }
                    else {
                        reject("Non 200 response code.", response);
                    }
                });
            });
            req.end();
        });
        return myPromise;
    }

    get_raw_messages() {
        const req = https.request("https://www.textnow.com/api/users/" + this.username + "/messages", {
            headers: {
                ...this.headers,
                cookie: this.processCookies(this.cookies)
            }
        });
        const myPromise = new Promise((resolve, reject) => {
            req.on("error", err => {
                reject(err);
            });
            req.on("response", response => {
                let body = "";
                response.on("data", data => {
                    body += data;
                });
                response.on("end", () => {
                    this.processCookies(response.headers['set-cookie']);
                    if (Math.floor(response.statusCode / 100) == 2) {
                        resolve(JSON.parse(body).messages);
                    }
                    else {
                        reject("Non 200 response code.", response);
                    }
                });
            });
            req.end();
        });
        return myPromise;
    }

    async get_sent_messages() {
        const messages = await this.get_messages();
        const sent_messages = messages.filter(msg => msg.direction == SENT_MESSAGE_TYPE);
        return new MessageContainer(sent_messages, this);
    }

    async get_received_messages() {
        const messages = await this.get_messages();
        const received_messages = messages.filter(msg => msg.direction == RECEIVED_MESSAGE_TYPE);
        return new MessageContainer(received_messages, this);
    }
    
    async get_unread_messages() {
        const messages = await this.get_received_messages();
        const read_messages = messages.filter(msg => !msg.read);
        return new MessageContainer(read_messages, this);
    }

    async get_read_messages() {
        const messages = await this.get_received_messages();
        const read_messages = messages.filter(msg => msg.read);
        return new MessageContainer(read_messages, this);
    }

    send_mms(to, file) {
        const myPromise = new Promise((resolve, reject) => {
            const mime_type = mime.getType(file);
            const file_type = mime_type.split("/")[0];
            const has_video = file_type == "video";
            const msg_type = file_type == "image" ? 2 : 4;

            const file_url_holder_req = https.request('https://www.textnow.com/api/v3/attachment_url?message_type=2', {
                headers: {
                    cookie: this.processCookies(this.cookies),
                    ...this.headers
                }
            });

            file_url_holder_req.on("response", res => {
                let body = "";
                res.on("data", data => {
                    body += data;
                });
                res.on("end", () => {
                    if (Math.floor(res.statusCode / 100) == 2) {
                        const file_url_holder = JSON.parse(body)["result"];

                        const raw = fs.readFileSync(file);

                        const headers_place_file = {
                            'accept': '*/*',
                            'content-type': mime_type,
                            'accept-language': 'en-US,en;q=0.9',
                            'mode': 'cors',
                            'method': 'PUT',
                            'credentials': 'omit'
                        };

                        const place_file_req = https.request(file_url_holder, {
                            headers: {
                                cookie: this.processCookies(this.cookies),
                                ...headers_place_file
                            },
                            method: "PUT"
                        });
                        place_file_req.on("response", pres => {
                            let pbody = "";
                            pres.on("data", pdata => {
                                pbody += pdata;
                            });
                            pres.on("end", () => {
                                if (Math.floor(pres.statusCode / 100) == 2) {
                                    const json_data = {
                                        "contact_value": to,
                                        "contact_type": 2, "read": 1,
                                        "message_direction": 2, "message_type": msg_type,
                                        "from_name": this.username,
                                        "has_video": has_video,
                                        "new": true,
                                        "date": new Date().toISOString(),
                                        "attachment_url": file_url_holder,
                                        "media_type": file_type
                                    }

                                    const send_file_req = https.request("https://www.textnow.com/api/v3/send_attachment", {
                                        headers: {
                                            cookie: this.processCookies(this.cookies),
                                            ...this.headers
                                        },
                                        method: "POST"
                                    });
                                    send_file_req.on("response", sres => {
                                        let sbody = "";
                                        sres.on("data", sdata => {
                                            sbody += sdata;
                                        });
                                        sres.on("end", () => {
                                            resolve(sres);
                                        });
                                    });
                                    send_file_req.setHeader("content-type", "application/json");
                                    send_file_req.write(JSON.stringify(json_data));
                                    send_file_req.end();
                                }
                                else {
                                    reject("Received a non-200 response code.");
                                }
                            });
                        });
                        place_file_req.write(raw);
                        place_file_req.end();
                    }
                    else {
                        reject("Received a non-200 response code.");
                    }
                });
            });
            file_url_holder_req.end();
        });
        return myPromise;
    }

    send_sms(to, text) {
        const myPromise = new Promise((resolve, reject) => {
            const data = {
                'json': JSON.stringify({
                    "contact_value": to,
                    "contact_type": 2,
                    "message": text,
                    "read": 1, "message_direction": 2,
                    "message_type": 1,
                    "from_name": this.username,
                    "has_video": false,
                    "new": true,
                    "date": new Date().toISOString()
                })
            }
            const request = https.request('https://www.textnow.com/api/users/' + this.username + '/messages', {
                headers: {
                    ...this.headers,
                    cookie: this.processCookies(this.cookies)
                },
                method: "POST"
            });
            request.on("response", response => {
                let body = "";
                response.on("data", data => {
                    body += data;
                });
                response.on("end", () => {
                    if (response.statusCode == 200) {
                        this.reverseCookie(response.headers['set-cookie']);
                    }
                    else {
                        console.log(response.statusCode);
                    }
                    resolve(response, body);
                });
            });
            request.setHeader("content-type", "application/json")
            request.write(JSON.stringify(data));
            request.end();
        });
        return myPromise;
    }



    /**
     * 
     * @param {Array} arr 
     * @returns {boolean}
     */
    all(arr) {
        for (let x = 0; x < arr.length; x++) {
            if (!arr[x]) return false;
        }
        return true;
    }
}
module.exports = Client;