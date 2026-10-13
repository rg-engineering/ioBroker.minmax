// This file extends the AdapterConfig type from "@types/iobroker"


//Interface zu meteored
export interface MinmaxConfig {
	name: string; 
	oid: string; 
    calcdif: boolean;

	
}




// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {

			name: string

		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};