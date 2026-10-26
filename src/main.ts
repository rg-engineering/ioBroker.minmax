/* eslint-disable prefer-template */
/*
 * Created with @iobroker/create-adapter v2.6.5
 */



//https://www.iobroker.net/#en/documentation/dev/adapterdev.md

import * as utils from "@iobroker/adapter-core";
import MinmaxController from "./lib/minmax-controller";

export class Minmax extends utils.Adapter {
	private minmaxController: MinmaxController | undefined;

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
		this.log.debug(`Starting with timezone ${this.config.timezone || "Europe/Berlin"}`);
		this.minmaxController = new MinmaxController(this);
		this.subscribeForeignObjects("*");

		const objects = await this.getForeignObjectsAsync("*", "state");
		await this.minmaxController.initialize(objects);
	}


	

	
	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		void (async () => {
			try {
				await this.minmaxController?.stop();
				this.unsubscribeForeignObjects("*");
			} catch (error) {
				this.log.error(`Failed to stop minmax controller: ${String(error)}`);
			} finally {
				callback();
			}
		})();
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  */
	private async onObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
		await this.minmaxController?.handleObjectChange(id, obj);
		if (obj) {
	 		// The object was changed
			  this.log.debug(`object ${id} changed`);

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

			 

			  

	 	} else {
	 		// The object was deleted
	 		this.log.info(`object ${id} deleted`);
	 	}
	}


	



	/**
	 * Is called if a subscribed state changes
	 */

	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		try {
			await this.minmaxController?.handleStateChange(id, state);
		} catch (error) {
			this.log.error(`Failed to process state change for ${id}: ${String(error)}`);
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

