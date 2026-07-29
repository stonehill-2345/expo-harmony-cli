import mustache from 'mustache';

const TEMPLATE = `
{
  "app": {
    "bundleName": "{{bundleName}}",
    "vendor": "example",
    "versionCode": 1000000,
    "versionName": "1.0.0",
    "icon": "$media:layered_image",
    "label": "$string:app_name",
  }
}
`;

export class AppScopeAppJSON5Template {
  constructor(private bundleName: string) {}

  build(): string {
    return mustache.render(TEMPLATE.trimStart(), {
      bundleName: this.bundleName,
    });
  }
}
