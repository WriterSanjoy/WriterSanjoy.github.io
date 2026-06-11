export default async function handler(req, res) {

  if(req.method !== "POST"){

    return res.status(405).json({
      success:false,
      message:"Method not allowed"
    });
  }

  try{

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;

    const {
      type,
      contentId,
      date
    } = req.body;

    if(
      !['books','blogs'].includes(type)
    ){
      return res.status(400).json({
        success:false,
        message:"Invalid type"
      });
    }

    const filePath =
      `comments/${type}/${contentId}.json`;

    const getResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers:{
          Authorization:`Bearer ${token}`,
          Accept:"application/vnd.github+json"
        }
      }
    );

    const fileData =
      await getResponse.json();

    if(!getResponse.ok){

      return res.status(404).json({
        success:false,
        message:"Comments file not found"
      });
    }

    const comments = JSON.parse(
      Buffer
        .from(fileData.content,"base64")
        .toString()
    );

    const target =
      comments.find(
        item => item.date === date
      );

    if(!target){

      return res.status(404).json({
        success:false,
        message:"Comment not found"
      });
    }

    target.likes =
      (target.likes || 0) + 1;

    const updatedContent = Buffer
      .from(
        JSON.stringify(comments,null,2)
      )
      .toString("base64");

    const saveResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method:"PUT",

        headers:{
          Authorization:`Bearer ${token}`,
          Accept:"application/vnd.github+json",
          "Content-Type":"application/json"
        },

        body:JSON.stringify({
          message:"Like comment",
          content:updatedContent,
          sha:fileData.sha
        })
      }
    );

    if(!saveResponse.ok){

      const err =
        await saveResponse.text();

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
