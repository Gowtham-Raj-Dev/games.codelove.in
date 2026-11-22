// Stand-alone CrazyGames build of Night Heist (see build-playables.mjs): npm run crazygames:build
process.env.TARGET = "crazygames";
await import("./build-playables.mjs");
