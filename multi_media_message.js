const Message = require("./message");
const https = require("https");
const fs = require("fs");

MUTLIMEDIA_MESSAGE_TYPE = 1;

class MultiMediaMessage extends Message {
    constructor (msg_obj, outer_self) {
        super(msg_obj, outer_self);
        this.self = outer_self;
        this.type = MUTLIMEDIA_MESSAGE_TYPE;
    }

    fetch() {
        const myPromise = new Promise((resolve, reject) => {
            const req = https.get(this.content);
            req.on("response", res => {
                let body = "";
                res.on("data", data => {
                    body += data;
                });
                res.on("end", () => {
                    this.raw_data = body;
                    this.content_type = res.headers["content-type"];
                    this.extension = this.content_type.split("/")[1];
                    resolve(body);
                });
                res.on("error", err => {
                    reject(err);
                });
            });
            req.on("error", err => {
                reject(err);
            });
        });
        return myPromise;
    }

    mv (file_path) {
        if (!file_path) {
            file_path = `./file.${this.extension}`
        }
        fs.writeFileSync(file_path, this.raw_data, "binary");
    }
}
module.exports=MultiMediaMessage;