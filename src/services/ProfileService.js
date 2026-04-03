import { supabase } from './SupabaseService.js';
import { eventBus } from './EventBus.js';

/**
 * ProfileService — CRUD for client profiles stored in Supabase.
 */
export class ProfileService {
  async getAll() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('name');
    if (error) throw error;
    return data;
  }

  async getById(id) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async create({ name, company, role, context, tags }) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('profiles')
      .insert({ user_id: user.id, name, company, role, context, tags })
      .select()
      .single();
    if (error) throw error;
    eventBus.emit('profiles:updated');
    return data;
  }

  async update(id, updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    eventBus.emit('profiles:updated');
    return data;
  }

  async delete(id) {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id);
    if (error) throw error;
    eventBus.emit('profiles:updated');
  }

  /**
   * Fetch all sessions linked to a specific profile.
   */
  async getSessionsForProfile(profileId) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, intention, status, duration, created_at, ended_at')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
}
