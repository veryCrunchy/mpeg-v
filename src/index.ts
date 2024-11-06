import 'dotenv/config'
import { ShardingManager } from 'discord.js';

import keys from "./keys";
console.log("Starting bot client in " + keys.NODE_ENV);


const manager = new ShardingManager(__dirname + '/client/index.js', { token: keys.clientToken });

manager.on('shardCreate', shard => console.log(`Launched shard ${shard.id}`));

manager.spawn();
