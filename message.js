const mime = require('mime');
const https = require('https');
const fs = require('fs');
const { Module } = require('module');

const MESSAGE_TYPE = 0;

class Message {
    constructor(msg_obj, outer_self) {
        this.content = msg_obj["message"];
        this.number = msg_obj["contact_value"];
        this.date = new Date(msg_obj["date"].replace("Z", "+00:00")); //TEST THIS
        this.type = MESSAGE_TYPE;
        this.read = msg_obj["read"];
        this.id = msg_obj["id"];
        this.direction = msg_obj["message_direction"];
        this.raw = msg_obj;
        this.self = outer_self;
    }
    toString() {
        const class_name = this.constructor.name;
        const s = `<${class_name} number: ${this.number}, content: ${this.content}>`;
        return s;
    }
    send_mms(file) {
        return this.self.send_mms(this.number, file);
    }

    send_sms(text) {
        return this.self.send_sms(this.number, text);
    }

    async mark_as_read() {
        await this.patch({ "read": true });
    }

    patch(data) {
        const myPromise = new Promise((resolve, reject) => {
            if (!this.self.all(Object.keys(data).map(key => { return key in this.raw }))) { //AKA, if the patch object contains keys that don't exist
                return;
            }
            const base_url = "https://www.textnow.com/api/users/" + this.self.username + "/conversations/";
            const url = base_url + encodeURIComponent(this.number);

            const params = {
                "latest_message_id": encodeURIComponent(this.id),
                "http_method": "PATCH"
            }

            let url_query = url + "?";

            Object.keys(params).forEach(param => {
                url_query += param;
                url_query += "=";
                url_query += params[param];
                url_query += "&";
            });

            url_query = url_query.substring(0, url_query.length - 1);
            console.log(url_query);
            const request = https.request(url_query, {
                headers: {
                    ...this.self.headers,
                    cookie: this.self.processCookies(this.self.cookies),
                    "content-type": "application/json"
                },
                method: "POST"
            });

            request.on("response", res => {
                let body = "";
                res.on("data", data => {
                    body += data;
                });
                res.on("end", () => {
                    console.log(res.statusCode);
                    resolve(res, data);
                });
                res.on("error", err => {
                    reject(err);
                });
            });
            request.on("error", err => {
                reject(err);
            });
            request.end();
        });
        return myPromise;
    }

    wait_for_response(timeout_bool) { //borken
        if (typeof (timeout_bool) !== "boolean") {
            timeout_bool = true;
        }
        this.mark_as_read();
        for (const msg in this.self.get_unread_messages()) {
            msg.mark_as_read();
        }
        const myPromise = new Promise((resolve, reject) => {
            const loop = setInterval(() => {
                const unread_messages = this.self.get_unread_messages();
                const filtered = unread_messages.get({ number: this.number });
                if (filtered.length != 0) {
                    clearInterval(loop);
                    resolve(filtered[0]);
                }
            }, 200);
            if (timeout_bool) {
                setTimeout(() => {
                    clearInterval(loop);
                    reject("Timeout");
                }, 10 * 60);
            }
        });
        return myPromise;
    }

    relative_time(minutes) {
        return new Date(oldDateObj.getTime() + minutes * 60000);
    }
}
module.exports = Message;