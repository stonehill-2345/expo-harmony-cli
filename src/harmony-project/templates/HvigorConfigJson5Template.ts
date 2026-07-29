import mustache from 'mustache';

const TEMPLATE = `
{
  "modelVersion": "5.0.0",
  "dependencies": {
    "@rnoh/hvigor-plugin": "../../node_modules/{{{rnohCliNpmPackageName}}}/harmony/{{{rnohHvigorPluginFilename}}}", // <PROJECT_ROOT>/node_modules/<RNOH_CLI>/harmony/rnoh-hvigor-plugin-X.X.X.tgz
  },
  "execution": {
    // "analyze": "default",                    /* Define the build analyze mode. Value: [ "default" | "verbose" | false ]. Default: "default" */
    // "daemon": true,                          /* Enable daemon compilation. Value: [ true | false ]. Default: true */
    // "incremental": true,                     /* Enable incremental compilation. Value: [ true | false ]. Default: true */
    // "parallel": true,                        /* Enable parallel compilation. Value: [ true | false ]. Default: true */
    // "typeCheck": false,                      /* Enable typeCheck. Value: [ true | false ]. Default: false */
  },
  "logging": {
    // "level": "info"                          /* Define the log level. Value: [ "debug" | "info" | "warn" | "error" ]. Default: "info" */
  },
  "debugging": {
    // "stacktrace": false                      /* Disable stacktrace compilation. Value: [ true | false ]. Default: false */
  },
  "nodeOptions": {
    // "maxOldSpaceSize": 4096                  /* Enable nodeOptions maxOldSpaceSize compilation. Unit M. Used for the daemon process */
  }
}
`;

export class HvigorConfigJson5Template {
  constructor(
    private rnohCliNpmPackageName: string,
    private rnohHvigorPluginFilename: string
  ) {}

  build(): string {
    return mustache.render(TEMPLATE.trimStart(), {
      rnohCliNpmPackageName: this.rnohCliNpmPackageName,
      rnohHvigorPluginFilename: this.rnohHvigorPluginFilename,
    });
  }
}
