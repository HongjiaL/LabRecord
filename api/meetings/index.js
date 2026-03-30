import { supabase } from '../../supabase.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return handleGetMeetings(req, res);
  }

  if (req.method === 'POST') {
    return handleCreateMeeting(req, res);
  }

  res.status(405).json({ error: 'Method not allowed' });
}

async function handleGetMeetings(req, res) {
  try {
    // Fetch all meetings ordered by date descending
    const { data: meetings, error: meetingsError } = await supabase
      .from('meetings')
      .select('*')
      .order('date', { ascending: false });

    if (meetingsError) throw meetingsError;

    if (!meetings || meetings.length === 0) {
      return res.status(200).json([]);
    }

    // Fetch all participants for these meetings
    const meetingIds = meetings.map(m => m.id);
    const { data: allParticipants, error: participantsError } = await supabase
      .from('participants')
      .select('*')
      .in('meeting_id', meetingIds);

    if (participantsError) throw participantsError;

    if (!allParticipants || allParticipants.length === 0) {
      return res.status(200).json(meetings.map(m => ({ ...m, participants: [] })));
    }

    // Fetch all literature for these participants
    const participantIds = allParticipants.map(p => p.id);
    const { data: allLiterature, error: literatureError } = await supabase
      .from('literature')
      .select('*')
      .in('participant_id', participantIds)
      .order('created_at', { ascending: true });

    if (literatureError) throw literatureError;

    // Build the nested structure
    const literatureByParticipant = {};
    if (allLiterature) {
      for (const lit of allLiterature) {
        if (!literatureByParticipant[lit.participant_id]) {
          literatureByParticipant[lit.participant_id] = [];
        }
        literatureByParticipant[lit.participant_id].push({
          id: lit.id,
          title: lit.title,
          authors: lit.authors,
          journal: lit.journal,
          doi: lit.doi,
          link: lit.link,
          keywords: lit.keywords || [],
          pptDataUrl: lit.ppt_data_url,
          pptFileName: lit.ppt_file_name,
          transcript: lit.transcript,
          createdAt: lit.created_at
        });
      }
    }

    const participantsByMeeting = {};
    for (const p of allParticipants) {
      if (!participantsByMeeting[p.meeting_id]) {
        participantsByMeeting[p.meeting_id] = [];
      }
      participantsByMeeting[p.meeting_id].push({
        id: p.id,
        name: p.name,
        literature: literatureByParticipant[p.id] || [],
        createdAt: p.created_at
      });
    }

    const result = meetings.map(m => ({
      id: m.id,
      date: m.date,
      topic: m.topic,
      notes: m.notes,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      participants: participantsByMeeting[m.id] || []
    }));

    return res.status(200).json(result);
  } catch (err) {
    console.error('[GET /api/meetings]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

async function handleCreateMeeting(req, res) {
  try {
    const { date, topic, notes, participants } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    // Insert meeting
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .insert({ date, topic, notes })
      .select()
      .single();

    if (meetingError) throw meetingError;

    const createdParticipants = [];

    // Insert participants and their literature
    if (participants && Array.isArray(participants) && participants.length > 0) {
      const participantInserts = participants.map(p => ({
        meeting_id: meeting.id,
        name: p.name || ''
      }));

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
              title: lit.title || '',
              authors: lit.authors || null,
              journal: lit.journal || null,
              doi: lit.doi || null,
              link: lit.link || null,
              keywords: lit.keywords || [],
              ppt_data_url: lit.pptDataUrl || null,
              ppt_file_name: lit.pptFileName || null,
              transcript: lit.transcript || null
            });
          }
        }
      }

      if (literatureInserts.length > 0) {
        const { error: literatureError } = await supabase
          .from('literature')
          .insert(literatureInserts);

        if (literatureError) throw literatureError;
      }

      // Rebuild nested structure for response
      const litData = literatureInserts.length > 0
        ? await supabase.from('literature').select('*').in('participant_id', insertedParticipants.map(p => p.id))
        : { data: [] };

      const literatureByParticipant = {};
      if (litData.data) {
        for (const lit of litData.data) {
          if (!literatureByParticipant[lit.participant_id]) {
            literatureByParticipant[lit.participant_id] = [];
          }
          literatureByParticipant[lit.participant_id].push({
            id: lit.id,
            title: lit.title,
            authors: lit.authors,
            journal: lit.journal,
            doi: lit.doi,
            link: lit.link,
            keywords: lit.keywords || [],
            pptDataUrl: lit.ppt_data_url,
            pptFileName: lit.ppt_file_name,
            transcript: lit.transcript,
            createdAt: lit.created_at
          });
        }
      }

      for (const p of insertedParticipants) {
        createdParticipants.push({
          id: p.id,
          name: p.name,
          literature: literatureByParticipant[p.id] || [],
          createdAt: p.created_at
        });
      }
    }

    return res.status(201).json({
      id: meeting.id,
      date: meeting.date,
      topic: meeting.topic,
      notes: meeting.notes,
      createdAt: meeting.created_at,
      updatedAt: meeting.updated_at,
      participants: createdParticipants
    });
  } catch (err) {
    console.error('[POST /api/meetings]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
