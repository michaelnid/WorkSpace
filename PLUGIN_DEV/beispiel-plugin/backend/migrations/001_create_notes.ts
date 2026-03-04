import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('example_notes', (table) => {
        table.increments('id').primary();
        table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants').onDelete('CASCADE');
        table.string('title', 200).notNullable();
        table.text('content').nullable();
        table.integer('created_by').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.index(['tenant_id']);
        table.index(['tenant_id', 'created_at']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('example_notes');
}
