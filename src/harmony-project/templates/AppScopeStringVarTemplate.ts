import mustache from 'mustache';

const TEMPLATE = `
{
  "string": [
    {
      "name": "app_name",
      "value": "{{name}}"
    }
  ]
}
`;

export class AppScopeStringVarTemplate {
  constructor(private name: string) {}

  build(): string {
    return mustache.render(TEMPLATE.trimStart(), {
      name: this.name,
    });
  }
}
