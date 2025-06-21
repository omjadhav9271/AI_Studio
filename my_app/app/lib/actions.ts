'use server';

import { z } from 'zod';
import postgres from 'postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

// 🔐 Connect to Postgres
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

// 🎯 Zod Schema to validate form input
const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
     invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce.number()
  .gt(0, { message: 'Please enter an amount greater than $0.' }), // coerce string to number (e.g., from form inputs)
  status: z.enum(['pending', 'paid'],{
     invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(), // ISO date string
});

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

// 📝 Create schema omits fields set automatically
const CreateInvoice = FormSchema.omit({ id: true, date: true });

export async function createInvoice(prevState: State, formData: FormData) {
  // Validate form using Zod
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });
 
  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }
 
  // Prepare data for insertion into the database
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];
 
  // Insert data into the database
  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
  } catch (error) {
    // If a database error occurs, return a more specific error.
    return {
      message: 'Database Error: Failed to Create Invoice.',
    };
  }
 
  // Revalidate the cache for the invoices page and redirect the user.
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

// 🔧 Update schema similar to create (still omits id and date)
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export async function updateInvoice(id: string, formData: FormData) {
  const rawFormData = {
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  };

  // ✅ Validate input
  const { customerId, amount, status } = UpdateInvoice.parse(rawFormData);

  const amountInCents = amount * 100;

  // 🛠 Update existing invoice
  try{
  await sql`
    UPDATE invoices
    SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
    WHERE id = ${id}
  `;
}
  catch (error) {
    console.error('Error updating invoice:', error);
    throw new Error('Failed to update invoice');
  }

  // 🔄 Revalidate and redirect
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  // throw new Error('Failed to Delete Invoice');
  await sql`DELETE FROM invoices WHERE id = ${id}`;
  revalidatePath('/dashboard/invoices');
}
