import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function checkAppPassword(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return null;
  const provided = req.headers['x-app-password'];
  if (!provided) return { status: 401, body: { error: 'Unauthorized: password required. Send X-App-Password header.' } };
  if (provided !== expected) return { status: 403, body: { error: 'Forbidden: incorrect password.' } };
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Password');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Meeting ID is required' });

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({
      error: 'Supabase 环境变量未配置。请在 Vercel 项目设置中添加 SUPABASE_URL 和 SUPABASE_ANON_KEY。'
    });
  }

  if (req.method === 'GET') return handleGetMeeting(req, res, id);
  if (req.method === 'PUT') {
    const authError = checkAppPassword(req);
    if (authError) return res.status(authError.status).json(authError.body);
    return handleUpdateMeeting(req, res, id);
  }
  if (req.method === 'DELETE') {
    const authError = checkAppPassword(req);
    if (authError) return res.status(authError.status).json(authError.body);
    return handleDeleteMeeting(req, res, id);
  }

  res.status(405).json({ error: 'Method not allowed' });
}

async function buildNestedMeeting(meeting) {
  if (!meeting) return null;

  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('*')
    .eq('meeting_id', meeting.id)
    .order('created_at', { ascending: true });

  if (participantsError) throw participantsError;
  const nestedParticipants = [];

  if (participants && participants.length > 0) {
    const { data: allLiterature, error: literatureError } = await supabase
      .from('literature')
      .select('*')
      .in('participant_id', participants.map(p => p.id))
      .order('created_at', { ascending: true });

    if (literatureError) throw literatureError;

    const literatureByParticipant = {};
    if (allLiterature) {
      for (const lit of allLiterature) {
        if (!literatureByParticipant[lit.participant_id]) literatureByParticipant[lit.participant_id] = [];
        literatureByParticipant[lit.participant_id].push({
          id: lit.id, title: lit.title, authors: lit.authors, journal: lit.journal,
          doi: lit.doi, link: lit.link, keywords: lit.keywords || [],
          pptDataUrl: lit.ppt_data_url, pptFileName: lit.ppt_file_name,
          transcript: lit.transcript, createdAt: lit.created_at
        });
      }
    }

    for (const p of participants) {
      nestedParticipants.push({
        id: p.id, name: p.name,
        literature: literatureByParticipant[p.id] || [],
        createdAt: p.created_at
      });
    }
  }

  return {
    id: meeting.id, date: meeting.date, topic: meeting.topic, notes: meeting.notes,
    createdAt: meeting.created_at, updatedAt: meeting.updated_at,
    participants: nestedParticipants
  };
}

async function handleGetMeeting(req, res, id) {
  try {
    const { data: meeting, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.details === 'The resource was not found') return res.status(404).json({ error: 'Meeting not found' });
      throw error;
    }
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const nested = await buildNestedMeeting(meeting);
    return res.status(200).json(nested);
  } catch (err) {
    console.error('[GET /api/meetings/:id]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

async function handleUpdateMeeting(req, res, id) {
  try {
    const { date, topic, notes, participants } = req.body;
    const { data: updatedMeeting, error: updateError } = await supabase
      .from('meetings')
      .update({ date, topic, notes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    const { error: deleteParticipantsError } = await supabase
      .from('participants')
      .delete()
      .eq('meeting_id', id);

    if (deleteParticipantsError) throw deleteParticipantsError;

    const nestedParticipants = [];

    if (participants && Array.isArray(participants) && participants.length > 0) {
      const participantInserts = participants.map(p => ({ meeting_id: id, name: p.name || '' }));
      const { data: insertedParticipants, error: participantsError } = await supabase
        .from('participants')
        .insert(participantInserts)
        .select();

      if (participantsError) throw participantsError;

      const literatureInserts = [];
      for (let i = 0; i < insertedParticipants.length; i++) {
        const p = insertedParticipants[i];
        const originalP = participants[i];
        if (originalP.literature && Array.isArray(originalP.literature)) {
          for (const lit of originalP.literature) {
            literatureInserts.push({
              participant_id: p.id,
              title: lit.title || '', authors: lit.authors || null,
              journal: lit.journal || null, doi: lit.doi || null, link: lit.link || null,
              keywords: lit.keywords || [],
              ppt_data_url: lit.pptDataUrl || null,
              ppt_file_name: lit.pptFileName || null,
              transcript: lit.transcript || null
            });
          }
        }
      }

      if (literatureInserts.length > 0) {
        const { error: literatureError } = await supabase.from('literature').insert(literatureInserts);
        if (literatureError) throw literatureError;
      }

      const litData = literatureInserts.length > 0
        ? await supabase.from('literature').select('*').in('participant_id', insertedParticipants.map(p => p.id))
        : { data: [] };

      const literatureByParticipant = {};
      if (litData.data) {
        for (const lit of litData.data) {
          if (!literatureByParticipant[lit.participant_id]) literatureByParticipant[lit.participant_id] = [];
          literatureByParticipant[lit.participant_id].push({
            id: lit.id, title: lit.title, authors: lit.authors, journal: lit.journal,
            doi: lit.doi, link: lit.link, keywords: lit.keywords || [],
            pptDataUrl: lit.ppt_data_url, pptFileName: lit.ppt_file_name,
            transcript: lit.transcript, createdAt: lit.created_at
          });
        }
      }

      for (const p of insertedParticipants) {
        nestedParticipants.push({
          id: p.id, name: p.name,
          literature: literatureByParticipant[p.id] || [],
          createdAt: p.created_at
        });
      }
    }

    return res.status(200).json({
      id: updatedMeeting.id, date: updatedMeeting.date, topic: updatedMeeting.topic, notes: updatedMeeting.notes,
      createdAt: updatedMeeting.created_at, updatedAt: updatedMeeting.updated_at,
      participants: nestedParticipants
    });
  } catch (err) {
    console.error('[PUT /api/meetings/:id]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

async function handleDeleteMeeting(req, res, id) {
  try {
    const { error } = await supabase.from('meetings').delete().eq('id', id);
    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/meetings/:id]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
