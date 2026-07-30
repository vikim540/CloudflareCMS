<template>
  <div class="preaching-seat" v-loading.fullscreen.lock="fullscreenLoading">
    <!-- <div class="preaching-seat-banner">
      <Banner class="banner-box">
        <template #banner>
          <div class="banner-img banner-text-default">
          </div>
        </template>
      </Banner>
    </div> -->
    <BannerSlider :gid="3" :num="1" setStyle="-mb-6 md:mb-5" />
    <div class="lecture-box mb-[56px]">
      <div class="lecture-title">
        <div>
          <div class="lecture-content">
            <div>
              <p class="text-[clamp(14px,4.44vw,24px)]" v-html="$t('appointFroms.title')"></p>
            </div>
            <div>
              <!-- <p>{{ $t("appointFroms.p1") }}</p> -->
              <!-- <p>旺角診所(星期一至五)：旺角彌敦道625及639號雅蘭中心一期702室</p> -->
              <!-- <p>旺角診所(星期六)：旺角彌敦道625及639號雅蘭中心一期1208室</p> -->
              <!-- <p>{{ $t("appointFroms.p2") }}</p> -->

              <p v-html="$t('appointFroms.p3')"></p>
              <p v-html="$t('appointFroms.p4')"></p>
              <p v-html="$t('appointFroms.p5')"></p>
              <!-- <p>
                尖沙咀診所︰尖沙咀梳士巴利道18-24號K11 ATELIER辦公大樓1906室
              </p> -->
            </div>
            <div class="lecture-form">
              <el-form
                ref="form"
                class="form0"
                :model="form"
                label-width="150px"
                size="medium"
              >
                <div class="lecture-form__service-wrap">
                  <el-form-item :label="$t('appointFroms.service')">
                    <el-select
                      v-model="serviceVal"
                      :placeholder="$t('appointFroms.sectionPlace')"
                      :popper-append-to-body="true"
                      @change="handleServiceChange"
                      clearable
                    >
                      <!-- <el-option
                      label="Smile Pro 講座-尖沙咀"
                      value="smilerProTsui"
                    ></el-option> -->
                      <!-- Smile Pro 講座-旺角 -->
                      <el-option
                        :label="$t('appointFroms.content0.title1')"
                        value="1"
                      ></el-option>
                      <!-- Smile Pro 講座-中環 -->
                      <el-option
                        :label="$t('appointFroms.content0.title2')"
                        value="2"
                      ></el-option>
                      <!-- Smile講座-中環 -->
                      <el-option
                        :label="$t('appointFroms.content0.title3')"
                        value="3"
                      ></el-option>
                      <!-- <el-option :label="$t('appointFroms.content1.title3')" value="smileMongKok"></el-option> -->
                      <!-- <el-option
                      label="老花講座-中環"
                      value="clearVisionCentral"
                    ></el-option> -->
                      <!-- Smile講座-旺角 -->
                      <!-- <el-option
                      :label="$t('appointFroms.content1.title3')"
                      value="smileMongKok"
                    ></el-option> -->
                      <!-- 老花講座-旺角 -->
                      <!-- <el-option
                      :label="$t('appointFroms.content1.title4')"
                      value="clearVisionMongKok"
                    ></el-option> -->
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="$t('appointFroms.title4')">
                    <el-select
                      v-model="addressVal"
                      :placeholder="$t('appointFroms.sectionPlace')"
                      :popper-append-to-body="true"
                      @change="changeLocation"
                      clearable
                    >
                      <!-- <el-option
                      label="Smile Pro 講座-尖沙咀"
                      value="smilerProTsui"
                    ></el-option> -->
                      <!-- Smile Pro 講座-旺角 -->
                      <el-option
                        :label="$t('appointFroms.content1.title1')"
                        value="1"
                        v-if="serviceVal != '2'"
                      ></el-option>
                      <!-- Smile Pro 講座-中環 -->
                      <!-- <el-option
                      :label="$t('appointFroms.content1.title5')"
                      value="smileProCentral"
                    ></el-option> -->
                      <!-- Smile講座-中環 -->
                      <el-option
                        :label="$t('appointFroms.content1.title2')"
                        value="2"
                        v-if="serviceVal != '3'"
                      ></el-option>
                      <!-- <el-option :label="$t('appointFroms.content1.title3')" value="smileMongKok"></el-option> -->
                      <!-- <el-option
                      label="老花講座-中環"
                      value="clearVisionCentral"
                    ></el-option> -->
                      <!-- Smile講座-旺角 -->
                      <!-- <el-option
                      :label="$t('appointFroms.content1.title3')"
                      value="smileMongKok"
                    ></el-option> -->
                      <!-- 老花講座-旺角 -->
                      <!-- <el-option
                      :label="$t('appointFroms.content1.title4')"
                      value="clearVisionMongKok"
                    ></el-option> -->
                    </el-select>
                  </el-form-item>
                </div>
                <el-form-item
                  :label="$t('appointFroms.content1.date')"
                  v-if="form.address !== ''"
                >
                  <el-date-picker
                    v-model="form.subdate"
                    type="date"
                    ref="subdate"
                    popper-class="date-picker-class"
                    :picker-options="startPickerOptions"
                    :placeholder="$t('appointFroms.content1.date')"
                    format=" MM 月 dd 日 yyyy 年"
                    value-format="timestamp"
                    @focus="focusSubDate"
                    clearable
                    :editable="false"
                  >
                  </el-date-picker>
                </el-form-item>
              </el-form>
              <p v-if="form.address && form.subdate" class="form-data">
                {{ $t("appointFroms.content2.p1") }}
                <span>{{ nowDayTime }} {{ morningOrAfternoon }}</span> 的
                <span>{{ getName(form.address) }}</span>
                {{ $t("appointFroms.content2.p2") }}
              </p>
              <el-form
                ref="form"
                :model="form1"
                class="form1"
                label-width="180px"
                v-if="form.address && form.subdate"
              >
                <el-form-item :label="$t('appointFroms.content2.local')">
                  <el-select
                    v-model="form1.numberSeat"
                    placeholder="0"
                    clearable
                  >
                    <el-option
                      v-for="(option, i) in 10"
                      :label="option"
                      :value="option"
                      :key="i"
                    ></el-option>
                  </el-select>
                </el-form-item>
                <el-form-item label="姓名" required>
                  <el-input
                    :placeholder="$t('appointFroms.content3.name')"
                    v-model="form1.name"
                    clearable
                  ></el-input>
                </el-form-item>
                <el-form-item label="性別">
                  <el-select v-model="form1.sex" placeholder="---" clearable>
                    <el-option label="---" value="null"></el-option>
                    <el-option label="女" value="0"></el-option>
                    <el-option label="男" value="1"></el-option>
                  </el-select>
                </el-form-item>
                <el-form-item :label="$t('appointFroms.content3.age')">
                  <el-select
                    v-model="form1.age"
                    :placeholder="$t('appointFroms.content3.choose')"
                    clearable
                  >
                    <el-option
                      :label="$t('appointFroms.content3.age1')"
                      value="17歲或以下"
                    ></el-option>
                    <el-option
                      :label="$t('appointFroms.content3.age2')"
                      value="18-25歲"
                    ></el-option>
                    <el-option
                      :label="$t('appointFroms.content3.age3')"
                      value="26-35歲"
                    ></el-option>
                    <el-option
                      :label="$t('appointFroms.content3.age4')"
                      value="36-45歲"
                    ></el-option>
                    <el-option
                      :label="$t('appointFroms.content3.age5')"
                      value="46-55歲"
                    ></el-option>
                    <el-option
                      :label="$t('appointFroms.content3.age6')"
                      value="56歲或以上"
                    ></el-option>
                  </el-select>
                </el-form-item>
                <el-form-item
                  :label="$t('appointFroms.content3.phone')"
                  required
                >
                  <el-input
                    :placeholder="$t('appointFroms.content3.phoneText')"
                    type="number"
                    v-model.number="form1.telphoneNumber"
                    number
                    clearable
                  ></el-input>
                </el-form-item>
                <el-form-item :label="$t('appointFroms.content3.email')">
                  <el-input
                    :placeholder="$t('appointFroms.content3.phoneText')"
                    type="email"
                    v-model="form1.email"
                    clearable
                  ></el-input>
                </el-form-item>
                <el-form-item :label="$t('appointFroms.content3.soure')">
                  <el-select
                    v-model="form1.source"
                    :placeholder="$t('appointFroms.content3.choose')"
                    clearable
                  >
                    <el-option
                      :label="$t('appointFroms.content4.p1')"
                      value="Google搜尋引擎"
                    ></el-option>
                    <el-option
                      :label="$t('appointFroms.content4.p2')"
                      value="Yahoo搜尋引擎"
                    ></el-option>
                    <el-option label="Facebook" value="Facebook"></el-option>
                    <el-option label="Instagram" value="Instagram"></el-option>
                    <el-option label="YouTube" value="YouTube"></el-option>
                    <el-option
                      :label="$t('appointFroms.content4.p3')"
                      value="討論區"
                    ></el-option>
                    <el-option
                      :label="$t('appointFroms.content4.p4')"
                      value="報章"
                    ></el-option>
                    <el-option
                      :label="$t('appointFroms.content4.p5')"
                      value="診所單張"
                    ></el-option>
                    <el-option
                      :label="$t('appointFroms.content4.p6')"
                      value="親友介紹"
                    ></el-option>
                    <el-option
                      :label="$t('appointFroms.content4.p7')"
                      value="員工介紹"
                    ></el-option>
                    <el-option label="其他" value="其他"></el-option>
                  </el-select>
                </el-form-item>
                <el-form-item label-width="0">
                  <el-button type="primary" @click="onSubmit">{{
                    $t("appointFroms.btn")
                  }}</el-button>
                </el-form-item>
              </el-form>
            </div>
          </div>
        </div>
      </div>

      <h2 class="lectureCalendar">{{ $t("appointFroms.LectureCalendar") }}</h2>
      <div class="lecture-image">
        <picture>
          <source
            srcset="
              https://statichk.cmermedical.com/smile/preaching-seat/calendar-ct-202608-v1.webp
            "
            type="image/webp"
          />
          <img
            src="https://statichk.cmermedical.com/smile/preaching-seat/calendar-ct-202608-v1.jpg"
            alt="希瑪眼科八月中環預約日歷"
            title="希瑪眼科八月中環預約日歷"
          />
        </picture>
        <picture>
          <source
            srcset="
              https://statichk.cmermedical.com/smile/preaching-seat/calendar-mk-202608-v1.webp
            "
            type="image/webp"
          />
          <img
            src="https://statichk.cmermedical.com/smile/preaching-seat/calendar-mk-202608-v1.jpg"
            alt="希瑪眼科八月旺角預約日歷"
            title="希瑪眼科八月旺角預約日歷"
          />
        </picture>
        <picture>
          <source
            srcset="
              https://statichk.cmermedical.com/smile/preaching-seat/calendar-2607-01-v1.avif
            "
            type="image/avif"
          />
          <source
            srcset="
              https://statichk.cmermedical.com/smile/preaching-seat/calendar-2607-01-v1.webp
            "
            type="image/webp"
          />
          <img
            src="https://statichk.cmermedical.com/smile/preaching-seat/calendar-2607-01-v1.jpg"
            alt="希瑪眼科七月中環預約日歷"
            title="希瑪眼科七月中環預約日歷"
          />
        </picture>
        <picture>
          <source
            srcset="
              https://statichk.cmermedical.com/smile/preaching-seat/calendar-2607-02-v1.avif
            "
            type="image/avif"
          />
          <source
            srcset="
              https://statichk.cmermedical.com/smile/preaching-seat/calendar-2607-02-v1.webp
            "
            type="image/webp"
          />
          <img
            src="https://statichk.cmermedical.com/smile/preaching-seat/calendar-2607-02-v1.jpg"
            alt="希瑪眼科七月旺角預約日歷"
            title="希瑪眼科七月旺角預約日歷"
          />
        </picture>
      </div>
    </div>
    <div v-show="applySuccess" class="applyDialog">
      <div
        class="applyDialog-wrap rounded-[1.78px] md:rounded-[5px] w-[90%] md:w-auto"
      >
        <div class="applyDialog-person">
          <picture>
            <source
              srcset="
                https://statichk.cmermedical.com/smile/appointform/appointform-person-pc@1x.avif 1x,
                https://statichk.cmermedical.com/smile/appointform/appointform-person-pc@2x.avif 2x
              "
              type="image/avif"
            />
            <source
              srcset="
                https://statichk.cmermedical.com/smile/appointform/appointform-person-pc@1x.webp 1x,
                https://statichk.cmermedical.com/smile/appointform/appointform-person-pc@2x.webp 2x
              "
              type="image/webp"
            />
            <img
              src="https://statichk.cmermedical.com/smile/appointform/appointform-person-pc@1x.jpg 1x,https://statichk.cmermedical.com/smile/appointform/appointform-person-pc@2x.jpg 2x"
              class="h-full object-cover"
            />
          </picture>
        </div>
        <div
          class="applyDialog-main relative text-center py-4 md:px-12 flex justify-center items-center"
        >
          <div>
            <div
              class="applyDialog-main-icon mb-2 md:mb-8 w-[22px] md:w-[58px] mx-auto"
            >
              <svg
                class="w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
                width="58"
                height="58"
                viewBox="0 0 58 58"
                fill="none"
              >
                <path
                  d="M0.000672084 28.9966C-0.103591 13.0757 13.0993 -0.00452954 29.0086 1.17666e-06C44.8567 0.0045319 58.0165 13.0553 58.0029 29.0329C57.9893 44.9289 44.8748 58.0566 28.8885 58C13.0064 57.9434 -0.108125 44.8564 0.000672084 28.9966ZM45.9152 20.7801C45.8744 20.3588 45.6273 20.053 45.344 19.7698C44.145 18.5692 42.9482 17.3685 41.7469 16.1724C40.8675 15.2957 40.3937 15.298 39.5143 16.1792C34.5572 21.1358 29.5957 26.0879 24.6499 31.0558C24.2782 31.4296 24.072 31.4183 23.7116 31.0513C21.93 29.2345 20.1235 27.4448 18.3216 25.6484C17.5917 24.9212 17.0818 24.9258 16.3474 25.6575C15.1053 26.8944 13.8655 28.1335 12.6302 29.3749C11.8618 30.1451 11.8686 30.5959 12.646 31.373C16.1343 34.8661 19.6226 38.3593 23.1132 41.8525C23.9949 42.736 24.3621 42.7337 25.2642 41.8321C29.9832 37.1179 34.7023 32.4037 39.4214 27.6872C41.4205 25.6892 43.4196 23.6911 45.4211 21.6931C45.6794 21.4348 45.9129 21.1698 45.922 20.7779L45.9152 20.7801Z"
                  fill="#4570B6"
                />
              </svg>
            </div>
            <div class="applyDialog-main-text flex flex-col gap-2 m-2">
              <p
                class="text-2xl md:text-[40px] font-black leading-[10.654px] md:leading-[30px] text-primary font-tc tracking-[1.421px] md:tracking-[1px] mb-[10.66px] md:mb-[31px]"
              >
                報名成功
              </p>
              <div
                class="text-base md:text-xl text-text font-hk font-light leading-[12.43px] md:leading-[35px] tracking-[1.421px] md:tracking-[4px] mb-[12.43px] md:mb-9 whitespace-nowrap flex flex-col gap-2"
              >
                <p>感謝您的填寫。</p>
                <p>我們已收到您的表單。</p>
                <p class="font-bold text-xs md:text-xl">
                  真人客戶服務員將在辦公時間回覆您！
                </p>
              </div>
            </div>
            <div
              class="applyDialog-main-button flex justify-center w-[106.186px] md:w-[291px] mx-auto bg-primary py-1"
            >
              <nuxt-link
                to="/"
                class="text-justify text-white font-tc fong-bold text-xl md:text-4xl leading-[22.374px] md:leading-[63px] tracking-[0.639px] md:tracking-[1.8px]"
                >返回主頁</nuxt-link
              >
            </div>
            <div
              class="applyDialog-close absolute right-[10px] top-[10px] md:right-[28px] md:top-[30px] w-[8.5px] md:w-6"
              @click="applySuccess = false"
            >
              <svg
                class="w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
              >
                <path
                  d="M2 25.9468L25.2083 2.73853"
                  stroke="#4570B6"
                  stroke-width="4"
                  stroke-linecap="round"
                />
                <path
                  d="M26 25.9468L2.79168 2.73853"
                  stroke="#4570B6"
                  stroke-width="4"
                  stroke-linecap="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- <div class="dialog-win" v-if="test">
      <div>
        <h3>提交信息, 是否继续?</h3>
        <div>
          <button @click="submitForm()">确认提交</button>
          <button @click="isOpenDialog(1)">取消</button>
        </div>
        <div @click="isOpenDialog(1)"><i></i><i></i></div>
      </div>
    </div> -->
    <!-- <Footer /> -->
  </div>
</template>
<script>
import BannerSlider from "@/components/commom/swiper/SwiperBanner.vue";
import H2Tag from "@/components/Publice/H2Tag.vue";
export default {
  components: {
    BannerSlider,
    H2Tag,
  },
  data() {
    return {
      fullscreenLoading: false,
      applySuccess: false,
      test: false,
      serviceVal: "",
      addressVal: "",
      form: {
        address: "",
        subdate: "",
      },
      form1: {
        numberSeat: "",
        name: "",
        sex: "",
        age: "",
        telphoneNumber: "",
        email: "",
        source: "",
        siteSource: "",
      },
      morningOrAfternoon: "",
      nowDayTime: "",
      allowedDates: [],
      startPickerOptions: {
        disabledDate: (time) => this.disabledDate(time),
      },
      isMobile: false,
      nowDayMonth: new Date().getMonth() + 1,
      canonicalHref: "https://smile.hkcmereye.com/ophthalmicInfo/AppointForm/",
      canonicalHrefCN:
        "https://smile.hkcmereye.com/cn/ophthalmicInfo/AppointForm/",
      browserTitle: "講座 - 希瑪微笑矯視中心",
      browserTitleCn: "講座 - 希玛微笑矫视中心",
    };
  },
  head() {
    if (this.$i18n.locale === "en") {
      return {
        meta: [{ hid: "robots", name: "robots", content: "noindex" }],
      };
    }

    return {
      title:
        this.$i18n.locale === "cn" ? this.browserTitleCn : this.browserTitle,
      meta: [
        {
          hid: "description",
          name: "description",
          content: "講座 - 希瑪微笑矯視中心",
        },
        {
          hid: "keywords",
          name: "keywords",
          content: "講座 - 希瑪微笑矯視中心",
        },
      ],
      link: [
        {
          rel: "canonical",
          href:
            this.$i18n.locale === "cn"
              ? this.canonicalHrefCN
              : this.canonicalHref,
        },
        {
          rel: "alternate",
          hreflang: "x-default",
          href: "https://smile.hkcmereye.com/ophthalmicInfo/AppointForm/",
        },
        {
          rel: "alternate",
          hreflang: "zh-Hant",
          href: "https://smile.hkcmereye.com/ophthalmicInfo/AppointForm/",
        },
        {
          rel: "alternate",
          hreflang: "zh-Hans",
          href: "https://smile.hkcmereye.com/cn/ophthalmicInfo/AppointForm/",
        },
      ],
      nowMonth: this.nowDayMonth,
    };
  },
  computed: {},
  methods: {
    isOpenDialog(index) {
      // index ==0  1  0开 1关
      if (index == 0) {
        this.test = true;
      } else {
        this.test = false;
        this.$message({
          showClose: true,
          message: "您已取消提交！",
          type: "warning",
        });
      }
    },
    /**
     * @description: 校验表单数据
     */
    onSubmit() {
      // 对预留位置、姓名、联络电话校验不能为空，判断邮件格式是否正确
      if (
        this.form1.numberSeat == "" ||
        this.form1.name == "" ||
        this.form1.telphoneNumber == ""
      ) {
        this.$message({
          message: "请檢查預留位置、姓名、聯絡電話不能為空！",
          type: "warning",
        });
        return;
      }
      // 郵件不为空，檢查郵箱格式
      // this.form1.email !== "" &&
      if (this.form1.email !== "") {
        if (
          !this.form1.email.includes("@") ||
          !this.form1.email.includes(".com")
        ) {
          this.$message({
            message: "請檢查郵件格式是否正確！",
            type: "warning",
          });
          return;
        }
      }
      console.log(this.form1, this.form, "form");
      // this.isOpenDialog(0);
      this.submitForm();
    },
    disabledDate(time) {
      try {
        const year = time.getFullYear();
        const month = String(time.getMonth() + 1).padStart(2, "0");
        const day = String(time.getDate()).padStart(2, "0");
        const ym = `${year}-${month}-${day}`;

        // 获取当前年月日
        const now = new Date();
        const nowYear = now.getFullYear();
        const nowMonth = String(now.getMonth() + 1).padStart(2, "0");
        const nowDay = String(now.getDate()).padStart(2, "0");
        const nowYm = `${nowYear}-${nowMonth}-${nowDay}`;
        if (ym < nowYm) {
          return true;
        }

        //把所有年月和需要建立的月份匹配，把匹配上的返回出去，让月份选择器可选
        return !this.allowedDates.includes(ym);
      } catch (error) {
        console.error("disabledDate encountered an error:", error);
      }
    },
    /**
     * @description: 处理服务类型改变
     */
    handleServiceChange() {
      this.addressVal = "";
      this.changeLocation();
    },
    /**
     * @description: 切换地点后调整可选日期
     */
    changeLocation() {
      this.clearFrom();

      console.log(this.serviceVal, this.addressVal, "changeLocation");
      // 当 serviceVal 和 addressVal 都不为空时，拼接它们并赋值给 form1.address

      if (this.serviceVal && this.addressVal) {
        // Smile Pro 講座-旺角
        if (this.serviceVal == 1 && this.addressVal == 1) {
          this.form.address = "smileProMongKok";
        } else if (this.serviceVal == 1 && this.addressVal == 2) {
          // Smile Pro 講座-中環
          this.form.address = "smileProCentral";
        } else if (this.serviceVal == 2 && this.addressVal == 2) {
          // Smile講座-中環
          this.form.address = "smileCentral";
        } else if (this.serviceVal == 3 && this.addressVal == 1) {
          // 老花講座-旺角
          this.form.address = "clearVisionMongKok";
        } else {
          this.form.address = "";
        }
      } else {
        // 当其中一个值为空时，清空 form1.address
        this.form.address = "";
      }
      // console.log(this.form1.address, "递四方速递");

      if (!this.form.address) {
        console.warn("changeLocation: address is empty");
        this.allowedDates = [];
        return;
      }
      const dateConfigs = {
        smilerProTsui: [],
        // 中环-smile
        smileCentral: [
          "2026-01-03",
          "2026-01-07",
          "2026-01-14",
          "2026-01-21",
          "2026-01-28",
          "2026-02-04",
          "2026-02-11",
          "2026-02-25",
          "2026-03-04",
          "2026-03-11",
          "2026-03-18",
          "2026-03-25",
          "2026-04-01",
          "2026-04-15",
          "2026-04-29",
          "2026-05-06",
          "2026-05-13",
          "2026-05-20",
          "2026-05-27",
          "2026-06-03",
          "2026-06-10",
          "2026-06-17",
          "2026-06-24",
          "2026-07-08",
          "2026-07-15",
          "2026-07-22",
          "2026-07-29",
          "2026-08-05",
          "2026-08-12",
          "2026-08-19",
          "2026-08-26",
        ],
        // 中环-smilePro
        smileProCentral: [
          "2026-01-10",
          "2026-01-17",
          "2026-01-24",
          "2026-01-31",
          "2026-02-07",
          "2026-02-21",
          "2026-02-28",
          "2026-03-07",
          "2026-03-14",
          "2026-03-21",
          "2026-03-28",
          "2026-04-11",
          "2026-04-18",
          "2026-04-25",
          "2026-05-02",
          "2026-05-09",
          "2026-05-16",
          "2026-05-23",
          "2026-05-30",
          "2026-06-06",
          "2026-06-13",
          "2026-06-20",
          "2026-06-27",
          "2026-07-04",
          "2026-07-11",
          "2026-07-18",
          "2026-07-25",
          "2026-08-01",
          "2026-08-08",
          "2026-08-15",
          "2026-08-22",
          "2026-08-29",
        ],
        smileMongKok: [],
        // 旺角-SmilePro
        smileProMongKok: [
          "2026-01-05",
          "2026-01-10",
          "2026-01-13",
          "2026-01-17",
          "2026-01-19",
          "2026-01-24",
          "2026-01-27",
          "2026-01-31",
          "2026-02-02",
          "2026-02-07",
          "2026-02-10",
          "2026-02-14",
          "2026-02-21",
          "2026-02-24",
          "2026-02-28",
          "2026-03-02",
          "2026-03-07",
          "2026-03-10",
          "2026-03-14",
          "2026-03-16",
          "2026-03-21",
          "2026-03-24",
          "2026-03-28",
          "2026-03-30",
          "2026-04-18",
          "2026-04-21",
          "2026-04-27",
          "2026-05-16",
          "2026-06-06",
          "2026-06-15",
          "2026-06-27",
          "2026-07-06",
          "2026-07-18",
          "2026-07-25",
          "2026-08-03",
          "2026-08-08",
          "2026-08-22",
          "2026-08-31",
        ],
        clearVisionCentral: [],
        // 旺角-老花矫视
        clearVisionMongKok: [
          "2026-01-03",
          "2026-01-06",
          "2026-01-12",
          "2026-01-20",
          "2026-01-26",
          "2026-02-03",
          "2026-02-09",
          "2026-02-23",
          "2026-03-03",
          "2026-03-09",
          "2026-03-17",
          "2026-03-23",
          "2026-03-31",
          "2026-04-11",
          "2026-04-14",
          "2026-04-20",
          "2026-05-05",
          "2026-05-11",
          "2026-05-18",
          "2026-05-23",
          "2026-05-26",
          "2026-06-02",
          "2026-06-13",
          "2026-06-16",
          "2026-06-22",
          "2026-06-29",
          "2026-06-30",
          "2026-07-11",
          "2026-07-14",
          "2026-07-20",
          "2026-07-27",
          "2026-07-28",
          "2026-08-11",
          "2026-08-15",
          "2026-08-17",
          "2026-08-24",
          "2026-08-25",
        ],
      };
      this.allowedDates = dateConfigs[this.form.address] || [];
    },
    /**
     * @description: 时间戳转换为字符串
     * @param {number} timestamp
     */
    timestampToWeekday(timestamp) {
      const date = new Date(timestamp); // 时间戳通常是秒为单位的，而 Date 构造函数需要毫秒为单位的参数
      const dayOfWeek = date.getDay();
      // 获取当前年月日的字符串表示
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      // 根据星期几返回对应的中文表示
      const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      // 返回格式化后的字符串
      const nowDay = `${year}年${month}月${day}日`;
      const weekday = weekdays[dayOfWeek];
      const isoDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
      }).format(new Date(timestamp));
      return {
        nowDay,
        weekday,
        isoDate,
      };
    },
    /**
     * @description: 根据日期匹配预约时间
     * @param {string} nameAddress 选择地点
     */
    getName(nameAddress) {
      if (!this.form.subdate || !nameAddress) return null;
      // 初步处理讲座时间
      const { nowDay, weekday, isoDate } = this.timestampToWeekday(
        this.form.subdate
      );
      console.log(
        `已进入getName函数,nameAddress=${nameAddress},subdate=${this.form.subdate},isoDate=${isoDate}`
      );
      this.nowDayTime = nowDay;
      // 映射表
      const schedules = {
        smileProMongKok: {
          name: "Smile Pro 2.0 講座-旺角",
          times: {
            周二: "1:30 下午",
            周四: "6:30 下午",
            周六: "2:30 下午",
            周一: "6:30 下午",
          },
        },
        smileProCentral: {
          name: "Smile Pro 2.0 講座-中環",
          times: {
            周六: "1:30 下午",
          },
        },
        smileCentral: {
          name: "Smile講座-中環",
          times: {
            周三: "1:30 下午",
            周六: "3:30 下午",
            周一: "6:30 下午",
            周二: "1:30 下午",
          },
        },
        smileMongKok: {
          name: "Smile講座-旺角",
          times: {
            周二: "1:30 下午",
            周四: "6:30 下午",
            周六: "1:30 下午",
            周三: "1:30 下午",
          },
        },
        clearVisionCentral: {
          name: "老花講座-中環",
          times: {},
        },
        clearVisionMongKok: {
          name: "老花講座-旺角",
          times: {
            周二: "1:30 下午",
            周六: "2:30 下午",
            周一: "6:30 下午",
            周四: "6:30 下午",
            "2025年10月6日": "1:30 下午",
            "2026年4月11日": "2:30 下午",
            "2026年5月23日": "2:30 下午",
          },
        },
      };
      // 处理时间
      const config = schedules[nameAddress];
      if (!config) return null;
      this.morningOrAfternoon =
        config.times[nowDay] || config.times[weekday] || "";
      // 处理讲座名称
      const lbv = [
        "2026-05-23",
        "2026-06-13",
        "2026-06-22",
        "2026-07-11",
        "2026-07-20",
        "2026-08-15",
        "2026-08-24",
      ];
      const seatname =
        nameAddress === "clearVisionMongKok" && lbv.includes(isoDate)
          ? "老花講座 (LBV特別場)-旺角"
          : config.name;
      return seatname;
    },
    getUrl() {
      return window.location.href;
    },
    /**
     * @description: 处理表单数据
     */
    async submitForm() {
      this.form1.siteSource = this.getUrl();
      let dataList = new FormData();
      let _dataList = { ...this.form, ...this.form1 };

      _dataList.address = this.getName(_dataList.address);
      _dataList.sex = _dataList.sex == "0" ? "女" : "男";
      _dataList.subdate = `${this.getYearMonthDay(_dataList.subdate)} ${
        this.morningOrAfternoon
      }`;
      window.localStorage.setItem("form", JSON.stringify(_dataList));
      for (const key in _dataList) {
        dataList.append(key, _dataList[key]);
      }
      this.submitAffirm(dataList);
    },
    /**
     * @description: 提交预约信息到服务器
     * @param {*} dataList
     */
    async submitAffirm(dataList) {
      this.fullscreenLoading = true;
      await fetch("https://admin.hkcmereye.com/api.php/cms/addmsg", {
        method: "POST",
        body: dataList,
      })
        .then((res) => res.json())
        .then((res) => {
          if (res.code === 1) {
            this.applySuccess = true;
            // this.$router.push({ path: "/messageFrom/" });
            // this.$message({
            //   showClose: true,
            //   message: "講座預約已提交成功！",
            //   type: "success",
            // });
            this.fullscreenLoading = false;
            this.clearFrom();
            this.form.address = "";
            this.test = false;
          }
        })
        .catch(() => {
          this.$message({
            message: "已取消",
            type: "info",
          });
        });
    },
    clearFrom() {
      // this.form.address = "";

      this.form.subdate = "";
      this.morningOrAfternoon = "";
      this.form1.numberSeat = "";
      this.form1.name = "";
      this.form1.sex = "";
      this.form1.age = "";
      this.form1.telphoneNumber = "";
      this.form1.email = "";
      this.form1.source = "";
      this.form1.siteSource = "";
    },
    getYearMonthDay(times) {
      // 通过时间戳获取 年 月 日
      let date = new Date(times);
      let year = date.getFullYear();
      let month = date.getMonth() + 1;
      let day = date.getDate();
      return year + "-" + month + "-" + day;
    },
    focusSubDate() {
      const arr = [];
      // 获取 type="button"  aria-label="前一年"
      setTimeout(() => {
        const elements = document.querySelectorAll(
          'button[type="button"][aria-label="前一年"]'
        );
        const elements1 = document.querySelectorAll(
          'button[type="button"][aria-label="上个月"]'
        );
        const elements2 = document.querySelectorAll(
          'button[type="button"][aria-label="后一年"]'
        );
        const elements3 = document.querySelectorAll(
          'button[type="button"][aria-label="下个月"]'
        );
        const buttonSpans = document.querySelectorAll('span[role="button"]');
        buttonSpans.forEach((item) => {
          item.style.color = "#303133";
          item.style.disabled = true;
          item.style.cursor = "no-drop";
        });

        // elements elements1 切换年份直接禁用
        // elements[0].style.color = "#303133";
        // elements[0].style.disabled = true;
        // elements[0].style.cursor = "no-drop";
        elements[0].style.display = "none";
        elements2[0].style.display = "none";

        // elements1[0].style.color = "#303133";
        // elements1[0].style.disabled = true;
        // elements1[0].style.cursor = "no-drop";

        // elements2[0].style.color = "#303133";
        // elements2[0].style.disabled = true;
        // elements2[0].style.cursor = "no-drop";
        // elements3[0].style.color = "#303133";
        // elements3[0].style.disabled = true;
        // elements3[0].style.cursor = "no-drop";
      }, 500);
    },
    getNowMonth() {
      // 获取当前月份
      const date = new Date();
      const month = date.getMonth() + 1;
      return month;
    },
  },
  mounted() {
    // 获取屏幕宽度
    window.addEventListener("resize", () => {
      if (window.innerWidth < 768) {
        this.isMobile = true;
      } else {
        this.isMobile = false;
      }
    });

    if (window.innerWidth < 768) {
      this.isMobile = true;
    } else {
      this.isMobile = false;
    }
  },
};
</script>

<style lang="scss">
// .el-select-dropdown__wrap {
//   padding-bottom: 8px;
// }
.el-select-dropdown__item {
  height: 50px;
  line-height: 50px;
}
@media screen and (min-width: 768px) {
  .preaching-seat {
    .header-top a:nth-child(2) {
      display: none !important;
    }
  }
}

@media screen and (max-width: 768px) {
  .el-select-dropdown__list {
    padding: 0;
  }

  .el-scrollbar__wrap {
    margin-bottom: 0 !important;
    overflow: auto;
  }
}

// .el-select-dropdown{
//   border: none;
//   box-shadow: none;
// }
// .el-range-editor.is-active, .el-range-editor.is-active:hover, .el-select .el-input.is-focus .el-input__inner{
//   border-top: 2px solid #4570B6;
//   border-left: 2px solid #4570B6;
//   border-right: 2px solid #4570B6;
//   border-bottom: 2px solid transparent;
// }

.date-picker-class {
  .el-picker-panel__content {
    .el-date-table {
      .el-date-table__row {
        .available {
          & > div {
            background: #4570b6;
            color: #fff;
          }

          & > div:hover {
            background: #b6e2eb;
            color: #fff;
            text-shadow: 0 0 5px 3px rgba(0, 0, 0, 0.5);
          }
        }

        td {
          & > div {
            background: #4570b6;
            color: #fff;
          }

          & > div:hover {
            background: #b6e2eb;
            color: #fff;
            text-shadow: 0 0 5px 3px rgba(0, 0, 0, 0.5);
          }
        }

        .today {
          span {
            color: #444;
          }
        }
      }

      .disabled {
        & > div {
          background-color: #f5f7fa !important;
          color: #c0c4cc !important;
        }

        & > div:hover {
          background-color: #f5f7fa !important;
          color: #c0c4cc !important;
        }
      }
    }
  }

  // .el-date-picker__header {
  //   & > button:nth-child(1):hover,
  //   & > button:nth-child(2):hover {
  //     color: #303133 !important;
  //     cursor: no-drop;
  //   }
  // }
}

@media screen and (max-width: 767px) {
  .el-picker-panel {
    left: 32px !important;
  }

  .el-date-picker__header {
    .el-picker-panel__icon-btn {
      font-size: 24px !important;
    }
  }

  button[type="button"][aria-label="前一年"] {
    display: none !important;
  }

  button[type="button"][aria-label="后一年"] {
    display: none !important;
  }
}
</style>
<style lang="scss" scoped>
.applyDialog {
  position: relative;

  &::before {
    content: "";
    z-index: 999;
    position: fixed;
    top: 0;
    left: 0;
    background-color: rgba($color: #000000, $alpha: 0.5);
    width: 100vw;
    height: 100vh;
  }

  &-wrap {
    z-index: 1000;
    display: flex;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: #fff;
  }

  &-main {
    background: url("https://statichk.cmermedical.com/smile/appointform/appointform-bg-success.svg")
      no-repeat;
  }
}

@media screen and (min-width: 768px) {
  .head-bg {
    top: 0;
    left: 0;
    width: 100%;
    background: #ffffff;
    z-index: 102;
  }
  .businessHours {
    margin-top: 30px;
  }

  .applyDialog {
    &-main {
      background-position: bottom right;
    }
  }

  .dialog-win {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    width: 100vw;
    height: 100vh;
    z-index: 91;
    display: flex;
    justify-content: center;
    align-items: center;

    & > div {
      border-radius: 15px;
      border: #4570b6 1px solid;
      box-shadow: 0px 0px 8px 6px #d5d5d5f7;
      display: flex;
      justify-content: center;
      flex-direction: column;
      align-items: center;
      background: #fff;
      width: 50%;
      position: relative;

      & > div:nth-child(2) {
        padding: 0 6.5vw 50px 6.5vw;
        margin-top: 60px;
        display: flex;
        align-content: flex-end;
        justify-content: flex-end;
        width: 100%;
      }
    }

    h3 {
      padding: 0 20px;
      display: flex;
      width: 100%;
      padding-top: 20px;
      border-bottom: 2px solid #8f8f8f;
    }

    button {
      text-align: center;
      font-family: "Noto Sans HK";
      font-size: 20px;
      font-style: normal;
      font-weight: 700;
      line-height: 30px;
      /* 150% */
      letter-spacing: 1px;
      padding: 5px 15px;
      border-radius: 5px;
      min-height: 40px;
    }

    button:hover {
      box-shadow: 0 0 3px 3px rgba(0, 0, 0, 0.3);
    }

    button:nth-child(1) {
      background: #4570b6;
      color: #fff;
    }

    button:nth-child(2) {
      background: #eece9f;
      color: #fff;
      margin-left: 20px;
    }
  }

  // .banner-box {
  //   box-sizing: border-box;
  //   padding: 0 3vw;
  //   max-width: 1270px;
  //   display: flex;
  //   justify-content: center;
  //   margin: 0 auto;
  // }

  .banner-img {
    background: url("https://statichk.cmermedical.com/smile/preaching-seat/banner-2606-pc-v1.webp")
      no-repeat;
    background-size: cover;
    // height: 32.08vw;
    width: 100%;
    aspect-ratio: 396 / 149;
    max-width: 1150px;
    max-height: 556px;
    background-position: center;
    border-radius: 55px;

    display: flex;
    align-items: flex-start;
    flex-direction: column;
    justify-content: center;
    padding-left: 70px;
    margin-bottom: 30px;

    & > p:nth-child(1) {
      color: #4570b6;
      font-family: "Noto Sans HK";
      font-size: 30px;
      font-style: normal;
      font-weight: 600;
      line-height: 50.75px;
      /* 169.167% */
      letter-spacing: 7.5px;
      display: none;
    }

    & > p:nth-child(2) {
      color: #4570b6;
      font-family: "Noto Sans HK";
      font-size: 15px;
      font-style: normal;
      font-weight: 500;
      line-height: 43.5px;
      /* 290% */
      letter-spacing: 0.45px;
      display: none;
    }
  }

  .preaching-seat {
    overflow: hidden;
  }

  .lecture-box {
    position: relative;
  }

  .lecture-title {
    // background: url("https://statichk.cmermedical.com/imgs/2024/04/03634579600959fb.png") no-repeat;
    background: #f6fafd;
    background-size: 100% 100%;
    width: 100vw;
    height: auto;
    padding: 0 0 85px;

    & > div {
      max-width: 1270px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
  }

  .lectureCalendar {
    color: #4570b6;
    font-family: "Noto Sans TC";
    font-size: 30px;
    font-style: normal;
    font-weight: 900;
    line-height: 39px;
    /* 130% */
    margin: 52px 0 0 0;
  }

  .title-img {
    // position: absolute;
    // top: -25%;
    // left: 50%;
    // transform: translateX(-50%);
    transform: translateY(-50%);
    width: 307px;
    height: 307px;
    background: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;

    & > div:nth-child(2) {
      margin-top: 10px;
      color: #4570b6;
      text-align: center;
      font-family: "Noto Sans";
      font-size: 30px;
      font-style: normal;
      font-weight: 400;
      line-height: 50px;
      /* 166.667% */
      letter-spacing: 7.5px;
    }
  }

  .lecture-content {
    margin-top: 4%;

    & > div:nth-child(1),
    & > div:nth-child(2) {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    & > div:nth-child(1) {
      p {
        color: #4570b6;
        text-align: center;
        font-family: "Noto Sans HK";
        font-size: 26px;
        font-style: normal;
        font-weight: 700;
        line-height: 45px;
        /* 225% */
        letter-spacing: 2.6px;
      }
    }

    & > div:nth-child(2) {
      margin-top: 20px;
      gap: 23px;

      P {
        color: #6d6e71;
        text-align: center;
        font-family: "Noto Sans HK";
        font-size: 20px;
        font-style: normal;
        font-weight: 300;
        line-height: 30px;
        /* 225% */
        letter-spacing: 2px;
      }
    }
  }

  .lecture-form {
    margin: 50px auto 0;
  }

  .lecture-form__service-wrap {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 30px;
    width: 100%;
    justify-content: space-between;
  }

  :deep(.el-form) {
    max-width: 1200px;
    margin: 0 auto;
  }

  .lecture-image {
    display: flex;
    justify-content: center;
    flex-direction: column;
    align-items: center;
    // margin: 85px 0;
    margin-top: 61px;
    gap: 77px;

    img {
      width: 952px;
    }
  }

  .form-data {
    color: #6d6e71;
    font-family: "Noto Sans HK";
    font-size: 20px;
    font-style: normal;
    font-weight: 300;
    line-height: 45px;
    letter-spacing: 6px;
    max-width: 870px;
    margin: 55px auto;
    border: 1px dashed #dadada;
    border-right: none;
    border-left: none;
    padding: 10px 0;

    span {
      color: #4570b6;
      font-weight: 700;
    }
  }

  :deep(.el-select) {
    width: 100%;
  }

  :deep(.el-date-editor) {
    width: 100%;
  }

  :deep(.el-form-item__label) {
    color: #fff;
    background: #4570b6;
    border-radius: 0px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: "Noto Sans HK";
    font-size: 20px;
    font-style: normal;
    font-weight: 700;
    line-height: 2.5;
    /* 100% */
    letter-spacing: 6px;
    // position: relative;
    z-index: 9;
    padding: 0;
    height: 100%;
  }

  :deep(.el-input__inner) {
    border-radius: 0px;
    border: 2px solid #4570b6;
    background: #fff;
    color: #87898c;
    font-family: "Noto Sans HK";
    font-size: 16px;
    font-style: normal;
    font-weight: 400;
    line-height: 2.5;
    /* 100% */
    letter-spacing: 2px;
    padding: 10px 0 10px 23px;
    height: 50px;
  }

  .form0 {
    :deep(.el-form-item:first-of-type .el-input__inner) {
      text-align: center;
    }

    :deep(.el-form-item:nth-of-type(2) .el-input__inner) {
      text-align: center;
    }

    :deep(.el-form-item:nth-of-type(3) .el-input__inner) {
      text-align: center;
    }
  }

  :deep(.form1) {
    & > div:last-child {
      display: flex;
      justify-content: center;

      .el-form-item__content {
        padding-left: 50px;
      }
    }
  }

  :deep(.el-button) {
    color: #fff;
    background: #4570b6;
    border-radius: 55px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: "Noto Sans HK";
    font-size: 20px;
    font-style: normal;
    font-weight: 700;
    line-height: 2.5;
    letter-spacing: 6px;
    padding: 0 60px;
  }

  :deep(.el-button:hover) {
    box-shadow: 0px 0px 8px 6px #d5d5d5f7;
  }

  .el-select-dropdown__item {
    text-align: center;
  }
}

@media screen and (min-width: 1024px) and (max-width: 1280px) {
  .lecture-title {
    & > div {
      max-width: 99.21875vw !important;
    }
  }
}

@media screen and (max-width: 767px) {
  .lectureCalendar {
    color: #4570b6;
    font-family: "Noto Sans TC";
    font-size: 20px;
    font-style: normal;
    font-weight: 900;
    line-height: 39px;
    /* 195% */
    margin: 10px 0;
  }

  .Banner {
    position: relative;
    z-index: 2;
  }

  .Banner .banner-text-default p:nth-child(1) {
    font-size: 20px;
    line-height: 1;
  }

  .Banner .banner-text-default p:nth-child(2) {
    font-size: 16px;
  }

  .dialog-win {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    width: 100vw;
    height: 100vh;
    z-index: 91;
    display: flex;
    justify-content: center;
    align-items: center;

    & > div {
      border-radius: 15px;
      border: #4570b6 1px solid;
      box-shadow: 0px 0px 8px 6px #d5d5d5f7;
      display: flex;
      justify-content: center;
      flex-direction: column;
      align-items: center;
      background: #fff;
      width: 80%;
      position: relative;

      h3 {
        color: #474747;
        text-align: center;
        font-family: "Noto Sans HK";
        font-size: 20px;
        font-style: normal;
        font-weight: 700;
        line-height: 1;
        letter-spacing: 2px;
        padding: 8px 15px;
        border-bottom: 1px solid #87898c80;
      }

      & > div:nth-child(2) {
        margin-top: 30px;
        padding: 0 6.5vw 6.5vw 6.5vw;

        button {
          text-align: center;
          font-family: "Noto Sans HK";
          font-size: 20px;
          font-style: normal;
          font-weight: 700;
          line-height: 30px;
          /* 150% */
          letter-spacing: 1px;
          padding: 5px 15px;
          border-radius: 5px;
          box-shadow: 0 0 3px 3px rgba(0, 0, 0, 0.3);
        }

        button:nth-child(1) {
          background: #4570b6;
          color: #fff;
        }

        button:nth-child(2) {
          background: #eece9f;
          color: #fff;
          margin-left: 20px;
        }
      }
    }
  }

  .banner-img {
    background: url("https://statichk.cmermedical.com/smile/preaching-seat/banner-2606-mb-v1.webp")
      no-repeat;
    background-size: 100% 100%;
    background-position: center;
    // height: 30vw;
    aspect-ratio: 1 / 1;
    margin: 20px 20px 0 20px;
    border-radius: 10px;
    // margin-top: 80px;
    display: flex;
    align-items: flex-start;
    flex-direction: column;
    justify-content: center;
    padding-left: 20px;

    & > p:nth-child(1) {
      color: #4570b6;
      font-family: "Noto Sans HK";
      font-style: normal;
      font-weight: 700;
      letter-spacing: 3.5px;
    }

    & > p:nth-child(2) {
      color: #4570b6;
      font-family: "Noto Sans HK";
      font-style: normal;
      font-weight: 500;
      letter-spacing: 0.3px;
    }
  }

  .lecture-box {
    position: relative;
  }

  .lecture-title {
    // background: url(https://statichk.cmermedical.com/imgs/2024/04/d7625f69f04ff1b8.png) no-repeat;
    background: #f6fafd;
    background-size: 100% 100%;
    width: 100%;
    margin-top: 50px;
    padding: 40px 0 40px;
    z-index: -1;

    & > div {
      display: flex;
      flex-direction: column;
      align-items: center;

      .title-img {
        position: absolute;
        top: -80px;
        left: 50%;
        transform: translateX(-50%);
        width: 170px;
        height: 170px;
        background: #fff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        z-index: 10;

        & > div:nth-child(1) {
          position: relative;
          top: 15px;
        }

        & > div:nth-child(2) {
          margin-top: 15px;
          color: #4570b6;
          text-align: center;
          font-family: "Noto Sans";
          font-size: 20px;
          font-style: normal;
          font-weight: 400;
          line-height: 35px;
          /* 175% */
          letter-spacing: 1px;
          position: relative;
          top: 3px;
        }
      }

      .lecture-content {
        // margin-top: -50px;
        & > div:nth-child(1) {
          color: #4570b6;
          text-align: center;
          font-family: "Noto Sans HK";
          font-size: 18px;
          font-style: normal;
          font-weight: 700;
          line-height: 1.5;
          letter-spacing: 0.7px;
          padding: 0 10px;
        }

        & > div:nth-child(2) {
          margin-bottom: 32px;
          color: #6d6e71;
          text-align: center;
          font-family: "Noto Sans HK";
          font-size: 16px;
          font-style: normal;
          font-weight: 300;
          line-height: 1.25;
          letter-spacing: 0.6px;
          gap: 20px;
          display: flex;
          flex-direction: column;
          margin: 20px 10px;

          // & > p:nth-child(2) {
          //   padding: 0 40px;
          // }

          & > p:nth-child(3) {
            padding: 0 10px;
          }

          & > p:nth-child(4) {
            padding: 0 15px;
          }
        }
      }
    }
  }

  .form-data {
    padding: 0 30px;
    color: #6d6e71;
    font-family: "Noto Sans HK";
    font-size: 16px;
    font-style: normal;
    font-weight: 500;
    line-height: 1.2;
    letter-spacing: 0.6px;

    span {
      color: #4570b6;
    }
  }

  .form1 {
    margin-top: 20px;
  }

  :deep(.el-form-item__label) {
    width: 30.76vw !important;
    color: #fff;
    background: #4570b6;
    border-radius: 0px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: "Noto Sans HK";
    font-size: 4.1vw;
    font-style: normal;
    font-weight: 700;
    line-height: 2.5;
    /* 125% */
    letter-spacing: 0.8px;
    position: relative;
    height: 50px;
    z-index: 9;
    padding: 0;
  }

  :deep(.el-picker-panel__icon-btn) {
    font-size: 24px !important;
    margin-right: 10px;
  }

  :deep(.el-form) {
    width: 100%;
    padding: 0 5.6vw;
  }

  .form0 {
    :deep(.el-form-item:first-of-type .el-input__inner) {
      text-align: center;
    }

    :deep(.el-form-item:nth-of-type(2) .el-input__inner) {
      text-align: center;
    }

    :deep(.el-form-item:nth-of-type(3) .el-input__inner) {
      text-align: center;
    }
  }

  :deep(.el-input__inner) {
    border-radius: 0px;
    border: 0.5vw solid #4570b6;
    background: #fff;
    color: #c0c4cc;
    font-family: "Noto Sans HK";
    font-size: 3.6vw;
    font-style: normal;
    font-weight: 400;
    line-height: 2.5;
    /* 142.857% */
    letter-spacing: 0.7px;
    padding: 4.5vw 0 4.5vw 12.89vw;
    height: 50px;
  }

  .lecture-form {
    width: 100vw;
  }

  .lecture-image {
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 30px;

    img {
      width: 100%;
    }
  }

  :deep(.el-form-item__content) {
    margin-left: 46.15vw !important;
    width: 70.5vw;
    line-height: 10.5vw;
    left: -25.6vw;
  }

  :deep(.form1) {
    & > div:last-child {
      display: flex;
      justify-content: center;

      .el-form-item__content {
        padding-left: 30px;
      }
    }
  }

  :deep(.el-button) {
    color: #fff;
    background: #4570b6;
    border-radius: 55px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: "Noto Sans HK";
    font-size: 20px;
    font-style: normal;
    font-weight: 700;
    line-height: 2.5;
    letter-spacing: 6px;
    padding: 0 60px;
  }

  :deep(.el-button:hover) {
    box-shadow: 0px 0px 8px 6px #d5d5d5f7;
  }

  :deep(.el-select) {
    width: 100%;
  }

  :deep(.el-date-editor) {
    width: 100%;
  }
}

:deep(.el-message-box) {
  width: 310px !important;
}
</style>
