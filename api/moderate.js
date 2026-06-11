export default async function handler(req,res){

  const adminPassword =
    req.headers['x-admin-password'];

  if(
    adminPassword !== process.env.ADMIN_PASSWORD
  ){
    return res.status(401).json({
      success:false,
      message:'Unauthorized'
    });
  }

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  // ═══════════════════════════════
  // LIST PENDING COMMENTS
  // ═══════════════════════════════

  if(
    req.method === 'GET' &&
    req.query.action === 'list'
  ){

    try{

      const sources = [

        {
          type:'books',
          ids:['book1','book2','book3']
        },

        {
          type:'blogs',
          ids:['blog22','blog23']
        }

      ];

      let pendingComments = [];

      for(const source of sources){

        for(const contentId of source.ids){

          const filePath =
            `comments/${source.type}/${contentId}.json`;

          const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
            {
              headers:{
                Authorization:`Bearer ${token}`,
                Accept:'application/vnd.github+json'
              }
            }
          );

          if(!response.ok){
            continue;
          }

          const fileData = await response.json();

          const comments = JSON.parse(
            Buffer
              .from(fileData.content,'base64')
              .toString()
          );

          comments.forEach(comment=>{

            if(comment.approved === false){

              pendingComments.push({

                ...comment,

                type:source.type,
                contentId

              });
            }
          });
        }
      }

      return res.status(200).json({
        success:true,
        comments:pendingComments
      });

    }catch(error){

      return res.status(500).json({
        success:false,
        message:error.message
      });
    }
  }

// ═══════════════════════════════
// APPROVE / DELETE
// ═══════════════════════════════

if(req.method === 'POST'){

  try{

    const {
      action,
      type,
      contentId,
      date
    } = req.body;

    const filePath =
      `comments/${type}/${contentId}.json`;

    // Load existing file

    const getResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers:{
          Authorization:`Bearer ${token}`,
          Accept:'application/vnd.github+json'
        }
      }
    );

    const fileData = await getResponse.json();

    const comments = JSON.parse(
      Buffer
        .from(fileData.content,'base64')
        .toString()
    );

    let updatedComments = comments;

    // APPROVE

    if(action === 'approve'){

      updatedComments = comments.map(comment=>{

        if(comment.date === date){

          return {
            ...comment,
            approved:true
          };
        }

        return comment;
      });
    }

    // DELETE

    if(action === 'delete'){

      updatedComments =
        comments.filter(
          comment => comment.date !== date
        );
    }

    // Save back to GitHub

    const updatedContent = Buffer
      .from(
        JSON.stringify(updatedComments,null,2)
      )
      .toString('base64');

    const saveResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method:'PUT',

        headers:{
          Authorization:`Bearer ${token}`,
          Accept:'application/vnd.github+json',
          'Content-Type':'application/json'
        },

        body:JSON.stringify({
          message:`Moderate comment (${action})`,
          content:updatedContent,
          sha:fileData.sha
        })
      }
    );

    if(!saveResponse.ok){

      const err = await saveResponse.text();

      return res.status(500).json({
        success:false,
        message:err
      });
    }

    return res.status(200).json({
      success:true
    });

  }catch(error){

    return res.status(500).json({
      success:false,
      message:error.message
    });
  }
}

  return res.status(400).json({
    success:false,
    message:'Invalid request'
  });
}
