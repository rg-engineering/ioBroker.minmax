/* eslint-disable prefer-template */
/*
 * Created with @iobroker/create-adapter v2.6.5
 */



//https://www.iobroker.net/#en/documentation/dev/adapterdev.md

import * as utils from "@iobroker/adapter-core";
import minmaxvalue from "./lib/minmaxvalue";
import type { MinmaxConfig } from './lib/adapter-config';

import ConfigStore from './lib/configstore';

export class Minmax extends utils.Adapter {

	private minmaxvalues: minmaxvalue[] = [];
	private configStore: ConfigStore | null = null;
		
	public constructor(options: Partial<utils.AdapterOptions> = {}) {
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
	private async onReady(): Promise<void> {

		await Promise.resolve();

		// Initialize your adapter here
		this.configStore = new ConfigStore(this);

		if (this.configStore) {

			this.minmaxvalues = this.configStore.ReadOldSetup();
			if (this.minmaxvalues.length > 0) {
				this.configStore.ReadOldSetup();
				this.configStore.SaveSetup(this.minmaxvalues);
			} else {
				this.minmaxvalues = this.configStore.ReadSetup();
			}
		} else {
			this.log.error("configStore is not initialized");
		}

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
	private onUnload(callback: () => void): void {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			

			
			

			callback();
		} catch (e) {
            this.log.error("exception in onUnload " + String(e));
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  */
	private async onObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
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
					  "unit": "°C",
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
			  this.configStore.SaveSetup(this.minmaxvalues);

			  

	 	} else {
	 		// The object was deleted
	 		this.log.info(`object ${id} deleted`);
	 	}
	}


	// Hilfsmethoden zum Hinzufügen/Aktualisieren/Entfernen von Einträgen in this.minmaxvalues
	// Anpassungen möglich (Typen, zusätzliche Felder), hier bewusst generisch gehalten.

	private async handleObject(obj: ioBroker.Object): Promise<void> {
		// Objektpfad prüfen (ioBroker-Objekte haben meist common.custom)
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
		const idx = this.minmaxvalues.findIndex((v: any) => v.id === id);

		if (enabled) {
			if (idx === -1) {
				// Neu anlegen
				const newMinmaxValue = this.createMinMaxValueFromObject(obj);
                await newMinmaxValue.Start();
				this.minmaxvalues.push(newMinmaxValue);
			} 
		} else {
			if (idx !== -1) {
				// Entfernen, wenn deaktiviert
				this.minmaxvalues.splice(idx, 1);
				this.log.info(`instance deleted`);
			}
		}
	}

	private createMinMaxValueFromObject(obj: ioBroker.Object): minmaxvalue{
		// Erstelle minmaxvalue aus dem Objekt. Felder anpassen wie benötigt.

		const config: MinmaxConfig = {
			oid: obj._id || obj.native.id,
			name: obj.common?.custom?.['minmax.0']?.logName || '',
			calcdif: obj.common?.custom?.['minmax.0']?.calcdif || false,
		}

		const newMinmaxValue = new minmaxvalue(this, this.minmaxvalues.length, config)

		return newMinmaxValue;
	}

	



	/**
	 * Is called if a subscribed state changes
	 */

	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			for (const minmaxValue of this.minmaxvalues) {
				if (minmaxValue.oid === id) {
					await minmaxValue.onStateChange(state);
				}
			}

			
	
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}
	

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  */
	private onMessage(obj: ioBroker.Message): void {
		if (typeof obj === "object" && obj.command) {
			 
				this.log.warn("got unknown message: " + obj.command + " / " + obj.message + " from " + obj.from);
			
		} else {
			this.log.warn("got invalid message object " + JSON.stringify(obj));
		}
	}


	

}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Minmax(options);
} else {
	// otherwise start the instance directly
	(() => new Minmax())();
}

