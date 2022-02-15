class MessageContainer extends Array {
    constructor(msg_list, outer_self) {
        msg_list = msg_list ? msg_list : [];
        super(...msg_list);
        this.outer_self = outer_self;
    }
    toString() {
        const ss = this.map(elem => elem.toString());
        const s = '[' + ss.join("\n") + ']';
        return s;
    }
    get(args) {
        let filtered_list = [];
        this.forEach(msg => {
            if (
                this.outer_self.all(
                    Object.keys(args).map(
                        arg => {
                            return Object.keys(msg).includes(arg);
                        }
                    )
                )
            ) {
                if (this.outer_self.all(
                    Object.keys(args).map(arg => {
                        return msg[arg] == args[arg];
                    })
                )
                ) {
                    filtered_list.push(msg);
                }
            }
        });
        return this.outer_self.MessageContainer(filtered_list, this.outer_self);
    }
}
module.exports=MessageContainer;