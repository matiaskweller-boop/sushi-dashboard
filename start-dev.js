// Launcher that sets cwd before Next.js tries to resolve it
process.chdir("/Users/matiaskw/Desktop/masunori-dashboard");
process.argv = [process.argv[0], "next", "dev"];
require("/Users/matiaskw/Desktop/masunori-dashboard/node_modules/next/dist/bin/next");
