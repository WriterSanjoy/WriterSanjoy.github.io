export default async function handler(req, res) {

  try {

    return res.status(200).json({
      success:true,
      method:req.method,
      query:req.query
    });

  } catch(error){

    return res.status(500).json({
      success:false,
      message:error.message
    });
  }
}
