import mustache from 'mustache';

const TEMPLATE = `
{
  "string": [
    {
      "name": "EntryAbility_desc",
      "value": "{{description}}"
    },
    {
      "name": "EntryAbility_label",
      "value": "{{name}}"
    }
  ]
}
`;

export class EntryStringVarTemplate {
  constructor(private name: string, private description: string) {}

  build(): string {
    return mustache.render(TEMPLATE.trimStart(), {
      name: this.name,
      description: this.description,
    });
  }
}
