"use strict";
/* eslint-disable prefer-template */
/*
 * Created with @iobroker/create-adapter v2.6.5
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Minmax = void 0;
//https://www.iobroker.net/#en/documentation/dev/adapterdev.md
const utils = __importStar(require("@iobroker/adapter-core"));
const minmaxvalue_1 = __importDefault(require("./lib/minmaxvalue"));
class Minmax extends utils.Adapter {
    minmaxvalues = [];
    constructor(options = {}) {
        super({
            ...options,
            name: "minmax",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("objectChange", this.onObjectChange.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.debug("config : " + JSON.stringify(this.config));
        //this.log.debug("API key : " + JSON.stringify(this.config.ApiKey));
        // subscribe to objects, so the settings in the object are arriving to the adapter
        this.subscribeForeignObjects("*");
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            callback();
        }
        catch (e) {
            this.log.error("exception in onUnload " + String(e));
            callback();
        }
    }
    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    async onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
            /*
            {
                "type": "state",
                "common": {
                    "name": "Temperature_Max",
                    "role": "value.temperature.max.forecast.0",
                    "type": "number",
                    "unit": "�C",
                    "read": true,
                    "write": false,
                    "desc": "Maximum temperature",
                    "custom": {
                        "minmax.0": {
                            "enabled": true,
                            "logName": "MinMaxTemp"
                        }
                    }
                },
                "native": {
                    "id": "location_1.ForecastDaily.Day_1.Temperature_Max"
                },
                "_id": "daswetter.0.location_1.ForecastDaily.Day_1.Temperature_Max",
                "acl": {
                    "object": 1636,
                    "state": 1636,
                    "owner": "system.user.admin",
                    "ownerGroup": "system.group.administrator"
                },
                "from": "system.adapter.admin.0",
                "user": "system.user.admin",
                "ts": 1792170762861
            }
            */
            await this.handleObject(obj);
        }
        else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }
    // Hilfsmethoden zum Hinzuf�gen/Aktualisieren/Entfernen von Eintr�gen in this.minmaxvalues
    // Anpassungen m�glich (Typen, zus�tzliche Felder), hier bewusst generisch gehalten.
    async handleObject(obj) {
        // Objektpfad pr�fen (ioBroker-Objekte haben meist common.custom)
        const custom = obj?.common?.custom?.['minmax.0'];
        if (custom === undefined) {
            // Kein minmax.0-Eintrag vorhanden -> nichts tun
            return;
        }
        const enabled = !!custom.enabled;
        const id = obj._id || obj.native.id;
        if (!id) {
            return;
        }
        const idx = this.minmaxvalues.findIndex((v) => v.id === id);
        if (enabled) {
            if (idx === -1) {
                // Neu anlegen
                const newMinmaxValue = this.createMinMaxValueFromObject(obj);
                await newMinmaxValue.Start();
                this.minmaxvalues.push(newMinmaxValue);
            }
        }
        else {
            if (idx !== -1) {
                // Entfernen, wenn deaktiviert
                this.minmaxvalues.splice(idx, 1);
                this.log.info(`instance deleted`);
            }
        }
    }
    createMinMaxValueFromObject(obj) {
        // Erstelle minmaxvalue aus dem Objekt. Felder anpassen wie ben�tigt.
        const config = {
            oid: obj._id || obj.native.id,
            name: obj.common?.custom?.['minmax.0']?.logName || '',
            calcdif: obj.common?.custom?.['minmax.0']?.calcdif || false,
        };
        const newMinmaxValue = new minmaxvalue_1.default(this, this.minmaxvalues.length, config);
        return newMinmaxValue;
    }
    /**
     * Is called if a subscribed state changes
     */
    async onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            for (const minmaxValue of this.minmaxvalues) {
                if (minmaxValue.oid === id) {
                    await minmaxValue.onStateChange(state);
                }
            }
        }
        else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  */
    onMessage(obj) {
        if (typeof obj === "object" && obj.command) {
            this.log.warn("got unknown message: " + obj.command + " / " + obj.message + " from " + obj.from);
        }
        else {
            this.log.warn("got invalid message object " + JSON.stringify(obj));
        }
    }
}
exports.Minmax = Minmax;
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new Minmax(options);
}
else {
    // otherwise start the instance directly
    (() => new Minmax())();
}
//# sourceMappingURL=main.js.map